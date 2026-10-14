"""
Encryption at rest with AES-256-GCM.

Why AES-GCM?  It is "authenticated encryption": besides hiding the data,
every encrypted piece carries a 16-byte tag. If anyone modifies the stored
bytes, decryption fails instead of silently returning garbage.

Why chunks?  Files can be large. Encrypting in 1 MB pieces means we never
hold a whole file in memory, and downloads can stream chunk by chunk.

Layout of an encrypted object on disk (one record per chunk):

    [4 bytes: length L][12 bytes: random nonce][L bytes: ciphertext + 16-byte tag]
    [4 bytes: length L][12 bytes: random nonce][L bytes: ciphertext + 16-byte tag]
    ...

Each chunk is also bound to its file and position ("associated data" =
storage key + chunk index + is-last flag). So an attacker cannot reorder
chunks, move chunks from one file into another, or cut the file short
without decryption failing.
"""

import hashlib
import os
import struct
import uuid
from dataclasses import dataclass
from typing import BinaryIO, Iterable, Iterator

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.storage.base import StorageBackend

CHUNK_SIZE = 1024 * 1024  # 1 MB of plaintext per record
NONCE_SIZE = 12  # 96-bit nonce, the standard size for GCM
_LENGTH = struct.Struct(">I")  # 4-byte big-endian unsigned int
_AAD = struct.Struct(">Q?")  # chunk index (8 bytes) + is_last flag (1 byte)


class CorruptedFileError(Exception):
    """Raised when stored data was modified, truncated or uses the wrong key."""


def _associated_data(object_id: str, index: int, is_last: bool) -> bytes:
    """Data that is authenticated (but not encrypted) together with each chunk."""
    return object_id.encode("ascii") + _AAD.pack(index, is_last)


def _seal(aesgcm: AESGCM, object_id: str, plaintext: bytes, index: int, is_last: bool) -> bytes:
    """Encrypt one chunk into one record."""
    nonce = os.urandom(NONCE_SIZE)  # must never repeat for the same key, so random each time
    ciphertext = aesgcm.encrypt(nonce, plaintext, _associated_data(object_id, index, is_last))
    return _LENGTH.pack(len(ciphertext)) + nonce + ciphertext


def encrypt_chunks(
    aesgcm: AESGCM, object_id: str, plaintext_chunks: Iterable[bytes]
) -> Iterator[bytes]:
    """Turn plaintext chunks into encrypted records.

    We look one chunk ahead so we know which chunk is the last one.
    An empty file still produces one (empty) final record.
    """
    chunks = iter(plaintext_chunks)
    current = next(chunks, b"")
    index = 0
    for upcoming in chunks:
        yield _seal(aesgcm, object_id, current, index, is_last=False)
        current = upcoming
        index += 1
    yield _seal(aesgcm, object_id, current, index, is_last=True)


def _read_exact(f: BinaryIO, size: int) -> bytes:
    data = f.read(size)
    if len(data) != size:
        raise CorruptedFileError("Encrypted file is truncated")
    return data


def decrypt_chunks(aesgcm: AESGCM, object_id: str, f: BinaryIO) -> Iterator[bytes]:
    """Read records from an open encrypted object and yield plaintext chunks."""
    header = f.read(_LENGTH.size)
    if not header:
        raise CorruptedFileError("Encrypted file is empty")
    index = 0
    while True:
        if len(header) != _LENGTH.size:
            raise CorruptedFileError("Encrypted file is truncated")
        (length,) = _LENGTH.unpack(header)
        nonce = _read_exact(f, NONCE_SIZE)
        ciphertext = _read_exact(f, length)

        # Peek at the next header: if there is none, this record is the last.
        header = f.read(_LENGTH.size)
        is_last = not header
        try:
            plaintext = aesgcm.decrypt(nonce, ciphertext, _associated_data(object_id, index, is_last))
        except InvalidTag:
            raise CorruptedFileError("Encrypted file failed its integrity check") from None
        yield plaintext
        if is_last:
            return
        index += 1


@dataclass
class StoredBlob:
    """What we learn about a file while storing it."""

    key: str  # random name of the encrypted object in the backend
    size: int  # original (plaintext) size in bytes
    sha256: str  # checksum of the original bytes


class EncryptedStorage:
    """Wraps any StorageBackend so everything stored through it is encrypted."""

    def __init__(self, backend: StorageBackend, key: bytes, chunk_size: int = CHUNK_SIZE):
        self.backend = backend
        self.aesgcm = AESGCM(key)  # key must be 32 bytes for AES-256
        self.chunk_size = chunk_size

    def put(self, source: BinaryIO) -> StoredBlob:
        """Encrypt everything readable from `source` and store it under a new random key."""
        key = uuid.uuid4().hex
        checksum = hashlib.sha256()
        size = 0

        def plaintext_chunks():
            nonlocal size
            for chunk in iter(lambda: source.read(self.chunk_size), b""):
                checksum.update(chunk)
                size += len(chunk)
                yield chunk

        self.backend.save(key, encrypt_chunks(self.aesgcm, key, plaintext_chunks()))
        return StoredBlob(key=key, size=size, sha256=checksum.hexdigest())

    def get(self, key: str) -> Iterator[bytes]:
        """Yield the decrypted contents of `key`, one chunk at a time."""
        with self.backend.open(key) as f:
            yield from decrypt_chunks(self.aesgcm, key, f)

    def delete(self, key: str) -> None:
        self.backend.delete(key)

    def exists(self, key: str) -> bool:
        return self.backend.exists(key)
