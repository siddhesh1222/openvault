"""Unit tests for the encrypted storage layer (no HTTP involved)."""

import hashlib
import io
import os

import pytest

from app.storage.crypto import CorruptedFileError, EncryptedStorage
from app.storage.local import LocalStorage

CHUNK = 16  # tiny chunks so small test data still spans many chunks


@pytest.fixture
def storage(tmp_path):
    return EncryptedStorage(LocalStorage(tmp_path), key=os.urandom(32), chunk_size=CHUNK)


def read_all(storage, key) -> bytes:
    return b"".join(storage.get(key))


@pytest.mark.parametrize("size", [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, CHUNK * 5 + 3])
def test_round_trip(storage, size):
    data = os.urandom(size)
    blob = storage.put(io.BytesIO(data))
    assert blob.size == size
    assert blob.sha256 == hashlib.sha256(data).hexdigest()
    assert read_all(storage, blob.key) == data


def test_stored_bytes_are_not_plaintext(storage, tmp_path):
    data = b"TOP SECRET exam answers " * 10
    blob = storage.put(io.BytesIO(data))
    on_disk = (tmp_path / blob.key[:2] / blob.key).read_bytes()
    assert b"TOP SECRET" not in on_disk
    assert len(on_disk) > len(data)  # nonces + tags + length headers were added


def test_same_file_encrypts_differently_each_time(storage, tmp_path):
    a = storage.put(io.BytesIO(b"hello world"))
    b = storage.put(io.BytesIO(b"hello world"))
    disk = lambda k: (tmp_path / k[:2] / k).read_bytes()  # noqa: E731
    assert disk(a.key) != disk(b.key)  # random nonces


def _blob_path(tmp_path, key):
    return tmp_path / key[:2] / key


def test_tampering_is_detected(storage, tmp_path):
    blob = storage.put(io.BytesIO(os.urandom(100)))
    path = _blob_path(tmp_path, blob.key)
    raw = bytearray(path.read_bytes())
    raw[30] ^= 0x01  # flip one bit inside the ciphertext
    path.write_bytes(bytes(raw))
    with pytest.raises(CorruptedFileError):
        read_all(storage, blob.key)


def test_truncation_is_detected(storage, tmp_path):
    blob = storage.put(io.BytesIO(os.urandom(CHUNK * 4)))
    path = _blob_path(tmp_path, blob.key)
    record_size = 4 + 12 + CHUNK + 16  # header + nonce + ciphertext + tag
    # Drop the last two whole records: every remaining record is intact,
    # but the new "last" record was not encrypted as the last one.
    path.write_bytes(path.read_bytes()[: record_size * 2])
    with pytest.raises(CorruptedFileError):
        read_all(storage, blob.key)


def test_chunks_cannot_be_moved_between_files(storage, tmp_path):
    a = storage.put(io.BytesIO(b"A" * CHUNK))
    b = storage.put(io.BytesIO(b"B" * CHUNK))
    # Copy file A's (only) record over file B: same position, different file.
    _blob_path(tmp_path, b.key).write_bytes(_blob_path(tmp_path, a.key).read_bytes())
    with pytest.raises(CorruptedFileError):
        read_all(storage, b.key)


def test_wrong_key_cannot_decrypt(storage, tmp_path):
    blob = storage.put(io.BytesIO(b"private"))
    other = EncryptedStorage(LocalStorage(tmp_path), key=os.urandom(32), chunk_size=CHUNK)
    with pytest.raises(CorruptedFileError):
        read_all(other, blob.key)


def test_invalid_keys_rejected(tmp_path):
    backend = LocalStorage(tmp_path)
    with pytest.raises(ValueError):
        backend.open("../../etc/passwd")
