"""Tests for uploading, downloading, folders, versions, the Trash and access control."""

import hashlib
from pathlib import Path

import pytest

from app.config import get_settings
from app.database import SessionLocal
from app.models import ActivityLog, FileVersion, User


def blob_paths() -> list[Path]:
    root = Path(get_settings().storage_dir) / "blobs"
    return [p for p in root.rglob("*") if p.is_file()]


def create_folder(client, headers, name, parent_id=None, expect=201):
    response = client.post("/api/folders", headers=headers, json={"name": name, "parent_id": parent_id})
    assert response.status_code == expect, response.text
    return response.json()


def contents(client, headers, folder_id=None):
    params = {"folder_id": folder_id} if folder_id is not None else {}
    response = client.get("/api/folders/contents", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Upload / download / encryption
# ---------------------------------------------------------------------------


def test_upload_and_download_round_trip(client, register, upload, download):
    headers = register("alice@example.com")
    data = b"Hello OpenVault! " * 1000

    info = upload(headers, "hello.txt", data)
    assert info["name"] == "hello.txt"
    assert info["size"] == len(data)
    assert info["mime_type"] == "text/plain"
    assert info["version_count"] == 1

    assert download(headers, info["id"]) == data


def test_file_is_encrypted_on_disk(client, register, upload):
    headers = register("alice@example.com")
    upload(headers, "secret.txt", b"my bank PIN is 4321")
    on_disk = [p.read_bytes() for p in blob_paths()]
    assert len(on_disk) == 1
    assert b"bank PIN" not in on_disk[0]


def test_checksum_is_recorded(client, register, upload):
    headers = register("alice@example.com")
    info = upload(headers, "a.bin", b"\x00\x01\x02")
    with SessionLocal() as db:
        version = db.query(FileVersion).filter_by(file_id=info["id"]).one()
        assert version.sha256 == hashlib.sha256(b"\x00\x01\x02").hexdigest()


def test_used_bytes_updates_after_upload(client, register, upload):
    headers = register("alice@example.com")
    upload(headers, "a.txt", b"x" * 500)
    assert client.get("/api/auth/me", headers=headers).json()["used_bytes"] == 500


def test_same_name_creates_new_version(client, register, upload, download):
    headers = register("alice@example.com")
    first = upload(headers, "report.txt", b"draft")
    second = upload(headers, "REPORT.txt", b"final version")  # names are case-insensitive
    assert second["id"] == first["id"]
    assert second["version_count"] == 2
    assert second["size"] == len(b"final version")
    assert download(headers, first["id"]) == b"final version"
    assert len(contents(client, headers)["files"]) == 1


def test_old_versions_are_pruned(client, register, upload, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_versions", 3)
    headers = register("alice@example.com")
    for i in range(5):
        info = upload(headers, "log.txt", f"v{i}".encode())
    assert info["version_count"] == 3
    assert len(blob_paths()) == 3  # the two oldest blobs were deleted from disk


def test_upload_limit_and_quota(client, register, upload, monkeypatch):
    headers = register("alice@example.com")

    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    upload(headers, "big.bin", b"x", expect=413)
    monkeypatch.setattr(get_settings(), "max_upload_mb", 100)

    with SessionLocal() as db:
        db.query(User).update({"quota_bytes": 10})
        db.commit()
    upload(headers, "small.bin", b"12345")
    upload(headers, "too-much.bin", b"123456", expect=413)  # 5 + 6 > 10
    assert blob_paths() and len(blob_paths()) == 1  # rejected upload stored nothing


def test_html_is_never_rendered_inline(client, register, upload):
    headers = register("alice@example.com")
    info = upload(headers, "evil.html", b"<script>alert(1)</script>")
    links = client.post(f"/api/files/{info['id']}/links", headers=headers).json()
    response = client.get(links["preview_url"])
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["x-content-type-options"] == "nosniff"


def test_images_preview_inline_and_download_as_attachment(client, register, upload):
    headers = register("alice@example.com")
    info = upload(headers, "photo.png", b"\x89PNG fake")
    links = client.post(f"/api/files/{info['id']}/links", headers=headers).json()
    preview = client.get(links["preview_url"])
    dl = client.get(links["download_url"])
    assert preview.headers["content-type"] == "image/png"
    assert preview.headers["content-disposition"].startswith("inline")
    assert dl.headers["content-disposition"].startswith("attachment")


def test_download_is_logged(client, register, upload, download):
    headers = register("alice@example.com")
    info = upload(headers, "a.txt", b"abc")
    download(headers, info["id"])
    with SessionLocal() as db:
        assert db.query(ActivityLog).filter_by(action="file.download").count() == 1


def test_file_link_tokens_are_checked(client, register, upload):
    headers = register("alice@example.com")
    a = upload(headers, "a.txt", b"aaa")
    b = upload(headers, "b.txt", b"bbb")
    link_for_a = client.post(f"/api/files/{a['id']}/links", headers=headers).json()["preview_url"]
    token = link_for_a.split("token=")[1]

    # A link for file A cannot be used to read file B.
    assert client.get(f"/api/files/{b['id']}/content?token={token}").status_code == 401
    # A normal login token is not accepted as a file link.
    access = headers["Authorization"].split()[1]
    assert client.get(f"/api/files/{a['id']}/content?token={access}").status_code == 401
    # No token at all.
    assert client.get(f"/api/files/{a['id']}/content").status_code == 422


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------


def test_nested_folders_and_breadcrumbs(client, register, upload):
    headers = register("alice@example.com")
    docs = create_folder(client, headers, "Documents")
    college = create_folder(client, headers, "College", docs["id"])
    upload(headers, "syllabus.pdf", b"%PDF", folder_id=college["id"])

    top = contents(client, headers)
    assert [f["name"] for f in top["folders"]] == ["Documents"]
    assert top["breadcrumbs"] == [] and top["folder"] is None

    inner = contents(client, headers, college["id"])
    assert [c["name"] for c in inner["breadcrumbs"]] == ["Documents", "College"]
    assert [f["name"] for f in inner["files"]] == ["syllabus.pdf"]


def test_folder_name_rules(client, register, upload):
    headers = register("alice@example.com")
    create_folder(client, headers, "Photos")
    create_folder(client, headers, "photos", expect=409)  # case-insensitive clash
    create_folder(client, headers, "a/b", expect=422)
    create_folder(client, headers, "  ", expect=422)
    upload(headers, "Photos", b"x", expect=409)  # file can't take a folder's name


def test_rename_and_move_file(client, register, upload):
    headers = register("alice@example.com")
    folder = create_folder(client, headers, "Work")
    info = upload(headers, "notes.txt", b"n")
    upload(headers, "other.txt", b"o")

    renamed = client.patch(f"/api/files/{info['id']}", headers=headers, json={"name": "todo.md"})
    assert renamed.json()["name"] == "todo.md"
    assert renamed.json()["mime_type"] == "text/markdown"

    clash = client.patch(f"/api/files/{info['id']}", headers=headers, json={"name": "other.txt"})
    assert clash.status_code == 409

    moved = client.patch(f"/api/files/{info['id']}", headers=headers, json={"folder_id": folder["id"]})
    assert moved.json()["folder_id"] == folder["id"]
    back = client.patch(f"/api/files/{info['id']}", headers=headers, json={"folder_id": None})
    assert back.json()["folder_id"] is None


def test_folder_cannot_move_into_itself(client, register):
    headers = register("alice@example.com")
    parent = create_folder(client, headers, "Parent")
    child = create_folder(client, headers, "Child", parent["id"])

    assert client.patch(f"/api/folders/{parent['id']}", headers=headers,
                        json={"parent_id": child["id"]}).status_code == 400
    assert client.patch(f"/api/folders/{parent['id']}", headers=headers,
                        json={"parent_id": parent["id"]}).status_code == 400
    ok = client.patch(f"/api/folders/{child['id']}", headers=headers, json={"parent_id": None, "name": "Moved"})
    assert ok.json() == {**ok.json(), "parent_id": None, "name": "Moved"}


def test_search(client, register, upload):
    headers = register("alice@example.com")
    create_folder(client, headers, "Invoices 2026")
    upload(headers, "invoice_march.pdf", b"x")
    upload(headers, "photo.jpg", b"x")
    upload(headers, "100%_done.txt", b"x")

    result = client.get("/api/files/search", headers=headers, params={"q": "INVOICE"}).json()
    assert [f["name"] for f in result["folders"]] == ["Invoices 2026"]
    assert [f["name"] for f in result["files"]] == ["invoice_march.pdf"]
    # "%" is matched literally, not as a SQL wildcard.
    percent = client.get("/api/files/search", headers=headers, params={"q": "0%"}).json()
    assert [f["name"] for f in percent["files"]] == ["100%_done.txt"]


# ---------------------------------------------------------------------------
# Trash
# ---------------------------------------------------------------------------


def test_trash_and_restore_folder_with_contents(client, register, upload):
    headers = register("alice@example.com")
    folder = create_folder(client, headers, "Projects")
    sub = create_folder(client, headers, "OpenVault", folder["id"])
    upload(headers, "plan.md", b"plan", folder_id=sub["id"])

    assert client.delete(f"/api/folders/{folder['id']}", headers=headers).status_code == 200
    assert contents(client, headers)["folders"] == []
    # Only the top trashed folder is listed, not everything inside it.
    trash = client.get("/api/trash", headers=headers).json()
    assert [f["name"] for f in trash["folders"]] == ["Projects"] and trash["files"] == []
    # Trashed items are hidden from search and can't be opened.
    assert client.get("/api/files/search", headers=headers, params={"q": "plan"}).json()["files"] == []
    assert client.get("/api/folders/contents", headers=headers, params={"folder_id": sub["id"]}).status_code == 404

    restored = client.post(f"/api/folders/{folder['id']}/restore", headers=headers)
    assert restored.status_code == 200
    assert [f["name"] for f in contents(client, headers, sub["id"])["files"]] == ["plan.md"]


def test_restore_renames_on_conflict(client, register, upload):
    headers = register("alice@example.com")
    info = upload(headers, "cv.pdf", b"old")
    client.delete(f"/api/files/{info['id']}", headers=headers)
    upload(headers, "cv.pdf", b"new")  # new file with the same name meanwhile
    restored = client.post(f"/api/files/{info['id']}/restore", headers=headers).json()
    assert restored["name"] == "cv (1).pdf"


def test_permanent_delete_removes_blobs(client, register, upload):
    headers = register("alice@example.com")
    folder = create_folder(client, headers, "Old")
    upload(headers, "a.txt", b"a", folder_id=folder["id"])
    loose = upload(headers, "b.txt", b"b")
    upload(headers, "b.txt", b"b2")  # second version of b.txt
    assert len(blob_paths()) == 3

    # Must be in the Trash before it can be deleted forever.
    assert client.delete(f"/api/files/{loose['id']}/permanent", headers=headers).status_code == 404

    client.delete(f"/api/folders/{folder['id']}", headers=headers)
    client.delete(f"/api/files/{loose['id']}", headers=headers)
    response = client.delete("/api/trash", headers=headers)
    assert response.json()["message"] == "Deleted 2 item(s) forever"
    assert blob_paths() == []
    assert client.get("/api/trash", headers=headers).json() == {"folders": [], "files": []}
    assert client.get("/api/auth/me", headers=headers).json()["used_bytes"] == 0


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method, url",
    [
        ("get", "/api/files/{file}"),
        ("patch", "/api/files/{file}"),
        ("delete", "/api/files/{file}"),
        ("post", "/api/files/{file}/links"),
        ("get", "/api/folders/contents?folder_id={folder}"),
        ("delete", "/api/folders/{folder}"),
    ],
)
def test_users_cannot_touch_each_others_items(client, register, upload, method, url):
    alice = register("alice@example.com")
    bob = register("bob@example.com")
    file = upload(alice, "private.txt", b"alice only")
    folder = create_folder(client, alice, "Private")

    kwargs = {"json": {"name": "hacked"}} if method == "patch" else {}
    response = getattr(client, method)(url.format(file=file["id"], folder=folder["id"]), headers=bob, **kwargs)
    assert response.status_code == 404  # 404, not 403: don't reveal that it exists


def test_cannot_upload_into_someone_elses_folder(client, register, upload):
    alice = register("alice@example.com")
    bob = register("bob@example.com")
    folder = create_folder(client, alice, "Alice's")
    upload(bob, "sneaky.txt", b"x", folder_id=folder["id"], expect=404)
