"""
The storage interface.

Every storage backend (local disk today, MinIO/S3 in the future) must
provide these four methods. The rest of the app only talks to this
interface, so switching backends doesn't require changing any routes.
Backends store opaque bytes; they know nothing about encryption.
"""

from abc import ABC, abstractmethod
from typing import BinaryIO, Iterable


class StorageBackend(ABC):
    @abstractmethod
    def save(self, key: str, chunks: Iterable[bytes]) -> int:
        """Write all `chunks` under `key`. Returns the number of bytes written."""

    @abstractmethod
    def open(self, key: str) -> BinaryIO:
        """Open the object for reading (use it in a `with` block)."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove the object. Deleting a missing key is not an error."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Return True if an object is stored under `key`."""
