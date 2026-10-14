"""Tests for registration, login, JWT protection and profile updates."""

from app.database import SessionLocal
from app.models import ActivityLog, User
from app.security import create_token
from tests.conftest import PASSWORD


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_register_returns_token_and_user(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "Alice@Example.com", "name": " Alice ", "password": PASSWORD},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "alice@example.com"  # stored lower-case
    assert body["user"]["name"] == "Alice"  # whitespace trimmed
    assert "password_hash" not in body["user"]  # never leaked
    assert body["user"]["created_at"].endswith("Z")  # sent as UTC


def test_password_is_stored_as_bcrypt_hash(client, register):
    register("alice@example.com")
    with SessionLocal() as db:
        user = db.query(User).filter_by(email="alice@example.com").one()
        assert user.password_hash != PASSWORD
        assert user.password_hash.startswith("$2b$")  # bcrypt marker


def test_first_user_and_admin_email_become_admin(client):
    def reg(email):
        r = client.post("/api/auth/register", json={"email": email, "name": "x", "password": PASSWORD})
        return r.json()["user"]["is_admin"]

    assert reg("first@example.com") is True  # first account ever
    assert reg("second@example.com") is False
    assert reg("boss@example.com") is True  # matches ADMIN_EMAIL in conftest


def test_duplicate_email_rejected(client, register):
    register("alice@example.com")
    response = client.post(
        "/api/auth/register",
        json={"email": "ALICE@example.com", "name": "Again", "password": PASSWORD},
    )
    assert response.status_code == 409


def test_register_validation(client):
    short = client.post("/api/auth/register", json={"email": "a@example.com", "name": "A", "password": "short"})
    bad_email = client.post("/api/auth/register", json={"email": "not-an-email", "name": "A", "password": PASSWORD})
    blank_name = client.post("/api/auth/register", json={"email": "a@example.com", "name": "   ", "password": PASSWORD})
    assert short.status_code == bad_email.status_code == blank_name.status_code == 422


def test_login_success_and_failures(client, register):
    register("alice@example.com")

    ok = client.post("/api/auth/login", json={"email": "ALICE@example.com", "password": PASSWORD})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    wrong_pw = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong-password"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert wrong_pw.status_code == unknown.status_code == 401
    # Same message, so attackers can't tell which emails exist.
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


def test_login_is_logged_in_activity(client, register):
    register("alice@example.com")
    client.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    with SessionLocal() as db:
        actions = [a.action for a in db.query(ActivityLog).all()]
    assert actions == ["user.register", "user.login"]


def test_me_requires_valid_token(client, register):
    headers = register("alice@example.com")

    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "alice@example.com"
    assert me.json()["used_bytes"] == 0


def test_expired_and_wrong_type_tokens_rejected(client, register):
    register("alice@example.com")
    expired = create_token("1", "access", expires_minutes=-1)
    wrong_type = create_token("1", "file", expires_minutes=5)

    r1 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {wrong_type}"})
    assert r1.status_code == 401 and r1.json()["detail"] == "Token has expired"
    assert r2.status_code == 401 and r2.json()["detail"] == "Invalid token type"


def test_disabled_user_is_blocked(client, register):
    headers = register("alice@example.com")
    with SessionLocal() as db:
        db.query(User).filter_by(email="alice@example.com").update({"is_active": False})
        db.commit()

    assert client.get("/api/auth/me", headers=headers).status_code == 403
    login = client.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert login.status_code == 403


def test_update_profile_and_theme(client, register):
    headers = register("alice@example.com")
    response = client.patch("/api/users/me", headers=headers, json={"name": "Alice B", "theme": "dark"})
    assert response.status_code == 200
    assert response.json()["name"] == "Alice B"
    assert response.json()["theme"] == "dark"

    invalid = client.patch("/api/users/me", headers=headers, json={"theme": "purple"})
    assert invalid.status_code == 422


def test_change_password(client, register):
    headers = register("alice@example.com")

    wrong = client.post(
        "/api/users/me/password",
        headers=headers,
        json={"current_password": "not-it", "new_password": "a-brand-new-password"},
    )
    assert wrong.status_code == 400

    ok = client.post(
        "/api/users/me/password",
        headers=headers,
        json={"current_password": PASSWORD, "new_password": "a-brand-new-password"},
    )
    assert ok.status_code == 200

    old = client.post("/api/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    new = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "a-brand-new-password"})
    assert old.status_code == 401
    assert new.status_code == 200
