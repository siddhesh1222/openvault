"""Tests for public share links and sharing with specific users."""

from datetime import timedelta

import pytest

from app.database import SessionLocal
from app.models import ActivityLog, ShareLink, utcnow


def create_folder(client, headers, name, parent_id=None):
    response = client.post("/api/folders", headers=headers, json={"name": name, "parent_id": parent_id})
    assert response.status_code == 201, response.text
    return response.json()


def create_link(client, headers, expect=201, **body):
    response = client.post("/api/shares/links", headers=headers, json=body)
    assert response.status_code == expect, response.text
    return response.json()


def share_with(client, headers, email, expect=201, **body):
    response = client.post("/api/shares/users", headers=headers, json={"email": email, **body})
    assert response.status_code == expect, response.text
    return response.json()


@pytest.fixture
def alice(register):
    return register("alice@example.com", name="Alice")


@pytest.fixture
def bob(register):
    return register("bob@example.com", name="Bob")


# ---------------------------------------------------------------------------
# Public links
# ---------------------------------------------------------------------------


def test_public_file_link(client, alice, upload):
    file = upload(alice, "poster.png", b"\x89PNG poster")
    link = create_link(client, alice, file_id=file["id"])
    assert link["url"] == f"/s/{link['token']}"
    assert len(link["token"]) >= 32
    assert link["has_password"] is False and link["expires_at"] is None

    page = client.get(f"/api/public/s/{link['token']}").json()  # no login needed
    assert page["type"] == "file"
    assert page["name"] == "poster.png"
    assert page["owner_name"] == "Alice"
    assert page["requires_password"] is False

    content_url = f"/api/public/s/{link['token']}/files/{file['id']}/content"
    assert client.get(content_url).content == b"\x89PNG poster"  # preview: not counted
    assert client.get(content_url + "?download=1").content == b"\x89PNG poster"

    links = client.get("/api/shares/links", headers=alice, params={"file_id": file["id"]}).json()
    assert links[0]["download_count"] == 1
    with SessionLocal() as db:
        assert db.query(ActivityLog).filter_by(action="share.download").count() == 1


def test_unknown_token_is_404(client):
    assert client.get("/api/public/s/does-not-exist").status_code == 404


def test_password_protected_link(client, alice, upload):
    file = upload(alice, "salary.pdf", b"%PDF secret")
    link = create_link(client, alice, file_id=file["id"], password="open-sesame")
    token = link["token"]
    content_url = f"/api/public/s/{token}/files/{file['id']}/content"

    locked = client.get(f"/api/public/s/{token}").json()
    assert locked["requires_password"] is True
    assert locked["name"] is None and locked["file"] is None  # nothing leaks before unlock
    assert client.get(content_url).status_code == 401

    assert client.post(f"/api/public/s/{token}/unlock", json={"password": "wrong"}).status_code == 401
    access = client.post(f"/api/public/s/{token}/unlock", json={"password": "open-sesame"}).json()["access"]

    unlocked = client.get(f"/api/public/s/{token}", params={"access": access}).json()
    assert unlocked["requires_password"] is False and unlocked["name"] == "salary.pdf"
    assert client.get(content_url, params={"access": access}).content == b"%PDF secret"

    # Changing the password logs out everyone who unlocked with the old one.
    client.patch(f"/api/shares/links/{link['id']}", headers=alice, json={"password": "new-password"})
    assert client.get(content_url, params={"access": access}).status_code == 401

    # Removing the password makes the link open again.
    updated = client.patch(f"/api/shares/links/{link['id']}", headers=alice, json={"password": None}).json()
    assert updated["has_password"] is False
    assert client.get(content_url).status_code == 200


def test_unlock_token_only_works_for_its_own_link(client, alice, upload):
    a = upload(alice, "a.txt", b"a")
    b = upload(alice, "b.txt", b"b")
    link_a = create_link(client, alice, file_id=a["id"], password="pass-a")
    link_b = create_link(client, alice, file_id=b["id"], password="pass-b")
    access_a = client.post(f"/api/public/s/{link_a['token']}/unlock", json={"password": "pass-a"}).json()["access"]
    response = client.get(f"/api/public/s/{link_b['token']}/files/{b['id']}/content", params={"access": access_a})
    assert response.status_code == 401


def test_link_expiry(client, alice, upload):
    file = upload(alice, "a.txt", b"a")
    past = (utcnow() - timedelta(days=1)).isoformat() + "Z"
    create_link(client, alice, expect=422, file_id=file["id"], expires_at=past)

    # Times with a timezone are converted to UTC.
    link = create_link(client, alice, file_id=file["id"], expires_at="2099-01-01T00:00:00+05:30")
    assert link["expires_at"] == "2098-12-31T18:30:00Z"
    assert link["is_expired"] is False

    with SessionLocal() as db:  # pretend time has passed
        db.query(ShareLink).update({"expires_at": utcnow() - timedelta(minutes=1)})
        db.commit()
    assert client.get(f"/api/public/s/{link['token']}").status_code == 410
    assert client.get(f"/api/public/s/{link['token']}/files/{file['id']}/content").status_code == 410


def test_deleted_link_and_trashed_file_stop_working(client, alice, upload):
    file = upload(alice, "a.txt", b"a")
    first = create_link(client, alice, file_id=file["id"])
    second = create_link(client, alice, file_id=file["id"])

    client.delete(f"/api/shares/links/{first['id']}", headers=alice)
    assert client.get(f"/api/public/s/{first['token']}").status_code == 404

    client.delete(f"/api/files/{file['id']}", headers=alice)  # move to Trash
    assert client.get(f"/api/public/s/{second['token']}").status_code == 404


def test_public_folder_link_stays_inside_the_folder(client, alice, upload):
    shared = create_folder(client, alice, "Shared")
    inner = create_folder(client, alice, "Inner", shared["id"])
    private = create_folder(client, alice, "Private")
    inside = upload(alice, "inside.txt", b"in", folder_id=inner["id"])
    outside = upload(alice, "outside.txt", b"out", folder_id=private["id"])
    token = create_link(client, alice, folder_id=shared["id"])["token"]

    page = client.get(f"/api/public/s/{token}").json()
    assert page["type"] == "folder" and page["name"] == "Shared"
    assert [f["name"] for f in page["contents"]["folders"]] == ["Inner"]

    sub = client.get(f"/api/public/s/{token}", params={"folder_id": inner["id"]}).json()
    assert [c["name"] for c in sub["contents"]["breadcrumbs"]] == ["Shared", "Inner"]
    assert [f["name"] for f in sub["contents"]["files"]] == ["inside.txt"]
    assert client.get(f"/api/public/s/{token}/files/{inside['id']}/content").content == b"in"

    # Anything outside the shared folder is off limits.
    assert client.get(f"/api/public/s/{token}", params={"folder_id": private["id"]}).status_code == 404
    assert client.get(f"/api/public/s/{token}/files/{outside['id']}/content").status_code == 404


def test_only_owner_can_manage_links(client, alice, bob, upload):
    file = upload(alice, "a.txt", b"a")
    create_link(client, bob, expect=404, file_id=file["id"])  # bob can't even see it
    link = create_link(client, alice, file_id=file["id"])
    assert client.delete(f"/api/shares/links/{link['id']}", headers=bob).status_code == 404

    share_with(client, alice, "bob@example.com", file_id=file["id"], permission="edit")
    create_link(client, bob, expect=403, file_id=file["id"])  # edit access still can't share


def test_share_target_must_be_exactly_one(client, alice, upload):
    file = upload(alice, "a.txt", b"a")
    folder = create_folder(client, alice, "F")
    create_link(client, alice, expect=422)
    create_link(client, alice, expect=422, file_id=file["id"], folder_id=folder["id"])


# ---------------------------------------------------------------------------
# Sharing with users
# ---------------------------------------------------------------------------


def test_view_share_on_folder(client, alice, bob, upload):
    projects = create_folder(client, alice, "Projects")
    report_folder = create_folder(client, alice, "Report", projects["id"])
    doc = upload(alice, "report.pdf", b"%PDF", folder_id=report_folder["id"])
    share = share_with(client, alice, "bob@example.com", folder_id=projects["id"])
    assert share["permission"] == "view"
    assert share["target_user"]["email"] == "bob@example.com"

    items = client.get("/api/shares/with-me", headers=bob).json()["items"]
    assert len(items) == 1
    assert items[0]["folder"]["name"] == "Projects" and items[0]["owner"]["name"] == "Alice"

    # Bob can browse into sub-folders; breadcrumbs start at the shared folder.
    contents = client.get("/api/folders/contents", headers=bob, params={"folder_id": report_folder["id"]}).json()
    assert contents["permission"] == "view"
    assert [c["name"] for c in contents["breadcrumbs"]] == ["Projects", "Report"]
    assert [f["name"] for f in contents["files"]] == ["report.pdf"]

    # View = read only.
    assert client.post(f"/api/files/{doc['id']}/links", headers=bob).status_code == 200
    upload(bob, "hack.txt", b"x", folder_id=report_folder["id"], expect=403)
    assert client.patch(f"/api/files/{doc['id']}", headers=bob, json={"name": "x.pdf"}).status_code == 403
    assert client.delete(f"/api/files/{doc['id']}", headers=bob).status_code == 403


def test_edit_share_on_folder(client, alice, bob, upload):
    team = create_folder(client, alice, "Team")
    doc = upload(alice, "notes.txt", b"v1", folder_id=team["id"])
    share = share_with(client, alice, "bob@example.com", folder_id=team["id"], permission="edit")

    # Bob can upload (Alice pays the storage), add versions, rename and create folders...
    new_file = upload(bob, "bob.txt", b"from bob", folder_id=team["id"])
    assert client.get("/api/auth/me", headers=alice).json()["used_bytes"] == len(b"v1") + len(b"from bob")
    assert client.get("/api/auth/me", headers=bob).json()["used_bytes"] == 0
    assert upload(bob, "notes.txt", b"v2", folder_id=team["id"])["version_count"] == 2
    assert client.patch(f"/api/files/{doc['id']}", headers=bob, json={"name": "notes-v2.txt"}).status_code == 200
    sub = client.post("/api/folders", headers=bob, json={"name": "Bob's stuff", "parent_id": team["id"]})
    assert sub.status_code == 201

    # ...but deleting and moving stay with the owner.
    assert client.delete(f"/api/files/{new_file['id']}", headers=bob).status_code == 403
    assert client.patch(f"/api/files/{doc['id']}", headers=bob, json={"folder_id": None}).status_code == 403

    # Alice sees everything Bob did, in her own folder.
    names = [f["name"] for f in client.get("/api/folders/contents", headers=alice,
                                            params={"folder_id": team["id"]}).json()["files"]]
    assert names == ["bob.txt", "notes-v2.txt"]

    # Downgrade to view, then remove completely.
    client.patch(f"/api/shares/users/{share['id']}", headers=alice, json={"permission": "view"})
    upload(bob, "late.txt", b"x", folder_id=team["id"], expect=403)
    client.delete(f"/api/shares/users/{share['id']}", headers=alice)
    assert client.get("/api/folders/contents", headers=bob, params={"folder_id": team["id"]}).status_code == 404
    assert client.get("/api/shares/with-me", headers=bob).json()["items"] == []


def test_share_single_file(client, alice, bob, upload):
    file = upload(alice, "cv.pdf", b"%PDF")
    other = upload(alice, "diary.txt", b"private")
    share_with(client, alice, "BOB@example.com", file_id=file["id"])  # email is case-insensitive

    assert client.get(f"/api/files/{file['id']}", headers=bob).status_code == 200
    assert client.get(f"/api/files/{other['id']}", headers=bob).status_code == 404


def test_sharing_again_updates_permission(client, alice, bob, upload):
    file = upload(alice, "a.txt", b"a")
    first = share_with(client, alice, "bob@example.com", file_id=file["id"], permission="view")
    second = share_with(client, alice, "bob@example.com", file_id=file["id"], permission="edit")
    assert first["id"] == second["id"] and second["permission"] == "edit"
    assert len(client.get("/api/shares/users", headers=alice, params={"file_id": file["id"]}).json()) == 1


def test_share_errors(client, alice, upload):
    file = upload(alice, "a.txt", b"a")
    share_with(client, alice, "ghost@example.com", expect=404, file_id=file["id"])
    share_with(client, alice, "alice@example.com", expect=400, file_id=file["id"])
    share_with(client, alice, "alice@example.com", expect=422, file_id=file["id"], permission="admin")


def test_trashed_items_disappear_from_shared_with_me(client, alice, bob, upload):
    file = upload(alice, "a.txt", b"a")
    share_with(client, alice, "bob@example.com", file_id=file["id"])
    client.delete(f"/api/files/{file['id']}", headers=alice)
    assert client.get("/api/shares/with-me", headers=bob).json()["items"] == []
    assert client.get(f"/api/files/{file['id']}", headers=bob).status_code == 404


def test_shared_badge_in_owner_listing(client, alice, bob, upload):
    shared = upload(alice, "shared.txt", b"s")
    upload(alice, "private.txt", b"p")
    folder = create_folder(client, alice, "Linked")
    share_with(client, alice, "bob@example.com", file_id=shared["id"])
    create_link(client, alice, folder_id=folder["id"])

    contents = client.get("/api/folders/contents", headers=alice).json()
    assert {f["name"]: f["shared"] for f in contents["files"]} == {"private.txt": False, "shared.txt": True}
    assert contents["folders"][0]["shared"] is True


def test_user_search(client, alice, bob, register):
    register("carol@example.com", name="Carol Bobson")
    found = client.get("/api/users/search", headers=alice, params={"q": "bob"}).json()
    assert sorted(u["email"] for u in found) == ["bob@example.com", "carol@example.com"]
    assert client.get("/api/users/search", headers=alice, params={"q": "alice"}).json() == []  # not yourself
    assert client.get("/api/users/search", headers=alice, params={"q": "b"}).status_code == 422
