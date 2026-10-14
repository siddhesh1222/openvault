"""Tests for the admin panel API."""

from pathlib import Path

import pytest

from app.config import get_settings
from tests.conftest import PASSWORD


def blob_count() -> int:
    root = Path(get_settings().storage_dir) / "blobs"
    return sum(1 for p in root.rglob("*") if p.is_file())


@pytest.fixture
def admin(register):
    return register("admin@example.com", name="Admin")  # first user = admin


@pytest.fixture
def alice(register, admin):
    return register("alice@example.com", name="Alice")


def user_id(client, admin, email):
    users = client.get("/api/admin/users", headers=admin).json()
    return next(u["id"] for u in users if u["email"] == email)


@pytest.mark.parametrize(
    "method, url",
    [("get", "/api/admin/stats"), ("get", "/api/admin/users"), ("get", "/api/admin/activity"),
     ("patch", "/api/admin/users/1"), ("delete", "/api/admin/users/1")],
)
def test_non_admins_are_blocked(client, alice, method, url):
    kwargs = {"json": {}} if method == "patch" else {}
    assert getattr(client, method)(url, headers=alice, **kwargs).status_code == 403


def test_list_users_and_stats(client, admin, alice, upload):
    upload(alice, "a.txt", b"x" * 40)
    users = client.get("/api/admin/users", headers=admin).json()
    by_email = {u["email"]: u for u in users}
    assert by_email["alice@example.com"]["used_bytes"] == 40
    assert by_email["alice@example.com"]["file_count"] == 1
    assert by_email["alice@example.com"]["last_login_at"] is not None
    assert by_email["admin@example.com"]["is_admin"] is True

    assert [u["email"] for u in client.get("/api/admin/users", headers=admin, params={"q": "ALI"}).json()] == ["alice@example.com"]

    stats = client.get("/api/admin/stats", headers=admin).json()
    assert stats["user_count"] == 2 and stats["admin_count"] == 1
    assert stats["file_count"] == 1 and stats["total_used_bytes"] == 40


def test_change_quota(client, admin, alice, upload):
    uid = user_id(client, admin, "alice@example.com")
    updated = client.patch(f"/api/admin/users/{uid}", headers=admin, json={"quota_bytes": 10}).json()
    assert updated["quota_bytes"] == 10
    upload(alice, "big.txt", b"x" * 11, expect=413)  # the new quota is enforced


def test_disable_user(client, admin, alice, upload):
    file = upload(alice, "a.txt", b"x")
    link = client.post("/api/shares/links", headers=alice, json={"file_id": file["id"]}).json()
    uid = user_id(client, admin, "alice@example.com")

    client.patch(f"/api/admin/users/{uid}", headers=admin, json={"is_active": False})
    assert client.get("/api/auth/me", headers=alice).status_code == 403
    login = client.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert login.status_code == 403
    assert client.get(f"/api/public/s/{link['token']}").status_code == 404  # their links stop working

    client.patch(f"/api/admin/users/{uid}", headers=admin, json={"is_active": True})
    assert client.get("/api/auth/me", headers=alice).status_code == 200


def test_grant_admin(client, admin, alice):
    uid = user_id(client, admin, "alice@example.com")
    client.patch(f"/api/admin/users/{uid}", headers=admin, json={"is_admin": True})
    assert client.get("/api/admin/stats", headers=alice).status_code == 200


def test_admin_cannot_lock_themselves_out(client, admin):
    me = user_id(client, admin, "admin@example.com")
    assert client.patch(f"/api/admin/users/{me}", headers=admin, json={"is_active": False}).status_code == 400
    assert client.patch(f"/api/admin/users/{me}", headers=admin, json={"is_admin": False}).status_code == 400
    assert client.delete(f"/api/admin/users/{me}", headers=admin).status_code == 400
    # Changing their own quota is fine.
    assert client.patch(f"/api/admin/users/{me}", headers=admin, json={"quota_bytes": 5_000}).status_code == 200


def test_delete_user_removes_everything(client, admin, alice, upload):
    folder = client.post("/api/folders", headers=alice, json={"name": "Stuff"}).json()
    upload(alice, "a.txt", b"a", folder_id=folder["id"])
    upload(alice, "a.txt", b"a2", folder_id=folder["id"])  # 2 versions
    job = client.post("/api/backups/jobs", headers=alice, json={"name": "B"}).json()
    client.post(f"/api/backups/jobs/{job['id']}/run", headers=alice)
    upload(admin, "mine.txt", b"keep")
    assert blob_count() == 4  # 2 versions + 1 backup + admin's file

    uid = user_id(client, admin, "alice@example.com")
    response = client.delete(f"/api/admin/users/{uid}", headers=admin)
    assert response.status_code == 200
    assert blob_count() == 1  # only the admin's file is left
    assert [u["email"] for u in client.get("/api/admin/users", headers=admin).json()] == ["admin@example.com"]
    login = client.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert login.status_code == 401


def test_system_activity_shows_all_users(client, admin, alice, upload):
    upload(alice, "a.txt", b"x")
    page = client.get("/api/admin/activity", headers=admin).json()
    latest = page["items"][0]
    assert latest["action"] == "file.upload" and latest["user_email"] == "alice@example.com"
    uid = user_id(client, admin, "alice@example.com")
    client.patch(f"/api/admin/users/{uid}", headers=admin, json={"quota_bytes": 2 * 1024 * 1024})
    latest = client.get("/api/admin/activity", headers=admin).json()["items"][0]
    assert latest["action"] == "admin.user_update" and latest["details"] == "quota 2 MB"
