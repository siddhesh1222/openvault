"""
Application configuration.

All settings are read from environment variables (or a `.env` file), so no
secret is ever hard-coded in the source. Each field name maps to an
environment variable with the same name in UPPER_CASE, e.g. `secret_key`
is read from `SECRET_KEY`.
"""

import base64
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Look for .env in the repo root (when run from backend/) and in the
    # current folder. Real environment variables always win over the file.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_name: str = "OpenVault"

    # --- Secrets (required, no defaults on purpose) ---
    secret_key: str  # signs JWT tokens
    encryption_key: str  # base64-encoded 32-byte key for AES-256 file encryption

    # --- Database & storage ---
    # SQLite for development. For PostgreSQL use e.g.
    # postgresql+psycopg://user:password@localhost:5432/openvault
    database_url: str = "sqlite:///./data/openvault.db"
    storage_dir: str = "./data/storage"  # where encrypted file blobs are kept

    # --- Auth ---
    access_token_expire_minutes: int = 60  # how long a login lasts
    file_link_expire_minutes: int = 5  # how long a preview/download link lasts
    admin_email: str | None = None  # this user becomes admin on registration

    # --- Limits ---
    default_quota_mb: int = 1024  # storage quota given to every new user
    max_upload_mb: int = 100  # largest single file that can be uploaded
    max_versions: int = 10  # old versions kept per file

    # --- Misc ---
    cors_origins: list[str] = ["http://localhost:5173"]  # frontend dev server
    enable_scheduler: bool = True  # turn off in tests

    @field_validator("secret_key")
    @classmethod
    def check_secret_key(cls, value: str) -> str:
        """Refuse the placeholder from .env.example and keys that are easy to guess."""
        if value == "change-me" or len(value) < 16:
            raise ValueError("SECRET_KEY must be a random string of at least 16 characters (see .env.example)")
        return value

    @field_validator("encryption_key")
    @classmethod
    def check_encryption_key(cls, value: str) -> str:
        """Fail fast at startup if the AES key is not exactly 32 bytes."""
        try:
            raw = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("ENCRYPTION_KEY must be valid base64") from exc
        if len(raw) != 32:
            raise ValueError("ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256)")
        return value

    @property
    def encryption_key_bytes(self) -> bytes:
        return base64.b64decode(self.encryption_key)


@lru_cache
def get_settings() -> Settings:
    """Return one shared Settings object (created on first use)."""
    return Settings()
