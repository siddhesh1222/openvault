"""Tests for file version history and restoring older versions."""

from app.database import SessionLocal
from app.models import User


def versions(client, headers, file_id):
    response = client.get(f"/api/files/{file_id}/versions", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def download_version(client, headers, file_id, version_id) -> bytes:
    links = client.post(f"/api/files/{file_id}/versions/{version_id}/links", headers=headers).json()
    return client.get(links["download_url"]).content


def test_version_list_is_newest_first(client, register, upload):
    headers = register("alice@example.com", name="Alice")
    for text in (b"one", b"two", b"three"):
        info = upload(headers, "essay.txt", text)

    listed = versions(client, headers, info["id"])
    assert [v["version_no"] for v in listed] == [3, 2, 1]
    assert [v["is_current"] for v in listed] == [True, False, False]
    assert listed[0]["created_by_name"] == "Alice"
    assert listed[2]["size"] == 3


def test_download_old_version(client, register, upload, download):
    headers = register("alice@example.com")
    upload(headers, "essay.txt", b"first draft")
    info = upload(headers, "essay.txt", b"second draft")
    oldest = versions(client, headers, info["id"])[-1]

    assert download_version(client, headers, info["id"], oldest["id"]) == b"first draft"
    assert download(headers, info["id"]) == b"second draft"  # current is unchanged


def test_restore_copies_old_version_as_new(client, register, upload, download):
    headers = register("alice@example.com")
    upload(headers, "essay.txt", b"good")
    info = upload(headers, "essay.txt", b"broken")
    v1 = versions(client, headers, info["id"])[-1]

    restored = client.post(f"/api/files/{info['id']}/versions/{v1['id']}/restore", headers=headers)
    assert restored.status_code == 200
    assert restored.json()["version_count"] == 3  # nothing was overwritten
    assert download(headers, info["id"]) == b"good"

    current = versions(client, headers, info["id"])[0]
    again = client.post(f"/api/files/{info['id']}/versions/{current['id']}/restore", headers=headers)
    assert again.status_code == 400  # already current


def test_upload_new_version_keeps_name(client, register, upload, download):
    headers = register("alice@example.com")
    info = upload(headers, "photo.jpg", b"old")
    response = client.post(
        f"/api/files/{info['id']}/versions", headers=headers, files={"file": ("IMG_2041.jpg", b"new")}
    )
    assert response.status_code == 201
    assert response.json()["name"] == "photo.jpg"
    assert response.json()["version_count"] == 2
    assert download(headers, info["id"]) == b"new"


def test_restore_respects_quota(client, register, upload):
    headers = register("alice@example.com")
    upload(headers, "a.txt", b"12345")
    info = upload(headers, "a.txt", b"1")
    with SessionLocal() as db:
        db.query(User).update({"quota_bytes": 7})  # 6 bytes used; restoring v1 needs 5 more
        db.commit()
    v1 = versions(client, headers, info["id"])[-1]
    response = client.post(f"/api/files/{info['id']}/versions/{v1['id']}/restore", headers=headers)
    assert response.status_code == 413


def test_shared_users_and_versions(client, register, upload):
    alice = register("alice@example.com")
    viewer = register("viewer@example.com")
    editor = register("editor@example.com")
    upload(alice, "plan.txt", b"v1")
    info = upload(alice, "plan.txt", b"v2")
    for email, permission in (("viewer@example.com", "view"), ("editor@example.com", "edit")):
        client.post("/api/shares/users", headers=alice,
                    json={"file_id": info["id"], "email": email, "permission": permission})
    v1 = versions(client, alice, info["id"])[-1]
    restore_url = f"/api/files/{info['id']}/versions/{v1['id']}/restore"

    assert len(versions(client, viewer, info["id"])) == 2  # viewers can see history...
    assert download_version(client, viewer, info["id"], v1["id"]) == b"v1"
    assert client.post(restore_url, headers=viewer).status_code == 403  # ...but not restore
    assert client.post(restore_url, headers=editor).status_code == 200


def test_version_of_other_file_is_404(client, register, upload):
    headers = register("alice@example.com")
    a = upload(headers, "a.txt", b"a")
    b = upload(headers, "b.txt", b"b")
    b_version = versions(client, headers, b["id"])[0]
    response = client.post(f"/api/files/{a['id']}/versions/{b_version['id']}/links", headers=headers)
    assert response.status_code == 404
