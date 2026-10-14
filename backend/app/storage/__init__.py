"""
Storage package.

    base.py   - the StorageBackend interface
    local.py  - LocalStorage: objects as files on disk
    crypto.py - EncryptedStorage: AES-256-GCM layer on top of any backend

The app always uses `get_storage()`, which returns encrypted local storage.
To add MinIO later, write a MinIOStorage(StorageBackend) and use it here.
"""

from functools import lru_cache
from pathlib import Path

from app.config import get_settings
from app.storage.crypto import EncryptedStorage
from app.storage.local import LocalStorage


@lru_cache
def get_storage() -> EncryptedStorage:
    settings = get_settings()
    backend = LocalStorage(Path(settings.storage_dir) / "blobs")
    return EncryptedStorage(backend, settings.encryption_key_bytes)
