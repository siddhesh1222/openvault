"""
Shared test setup.

The environment variables below are set BEFORE the app is imported, so the
tests use a throw-away database and storage folder in a temp directory and
never touch real data.
"""

import base64
import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="openvault-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["STORAGE_DIR"] = str(_TMP / "storage")
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["ENCRYPTION_KEY"] = base64.b64encode(os.urandom(32)).decode()
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["ADMIN_EMAIL"] = "boss@example.com"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "correct-horse-battery"


@pytest.fixture
def client():
    """A test client with a fresh, empty database for every test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:  # `with` runs the app's startup code
        yield test_client


@pytest.fixture
def register(client):
    """Helper: register a user and return their auth headers.

    Usage:  headers = register("alice@example.com")
    """

    def _register(email: str, name: str = "Test User", password: str = PASSWORD) -> dict:
        response = client.post(
            "/api/auth/register", json={"email": email, "name": name, "password": password}
        )
        assert response.status_code == 201, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _register
