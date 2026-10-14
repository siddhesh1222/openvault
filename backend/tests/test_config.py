"""The app must refuse to start with missing or weak secrets."""

import base64
import os

import pytest
from pydantic import ValidationError

from app.config import Settings

GOOD_KEY = base64.b64encode(os.urandom(32)).decode()


def make(**overrides):
    values = {"secret_key": "a-long-random-secret-value", "encryption_key": GOOD_KEY, **overrides}
    return Settings(_env_file=None, **values)


def test_valid_settings():
    settings = make()
    assert len(settings.encryption_key_bytes) == 32


@pytest.mark.parametrize("secret", ["change-me", "short"])
def test_weak_secret_key_rejected(secret):
    with pytest.raises(ValidationError):
        make(secret_key=secret)


@pytest.mark.parametrize("key", ["change-me", base64.b64encode(b"16-bytes-only!!!").decode()])
def test_bad_encryption_key_rejected(key):
    with pytest.raises(ValidationError):
        make(encryption_key=key)
