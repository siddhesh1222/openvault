"""Storage backend that keeps objects as files in a folder on the local disk."""

import os
import re
from pathlib import Path
from typing import BinaryIO, Iterable

from app.storage.base import StorageBackend

# Keys are random 32-character hex strings (uuid4().hex). Accepting nothing
# else means a key can never be used for path tricks like "../../etc/passwd".
_KEY_PATTERN = re.compile(r"[0-9a-f]{32}")


class LocalStorage(StorageBackend):
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not _KEY_PATTERN.fullmatch(key):
            raise ValueError(f"Invalid storage key: {key!r}")
        # Spread objects over sub-folders (ab/abcd...) so no single folder
        # ends up with hundreds of thousands of files.
        return self.root / key[:2] / key

    def save(self, key: str, chunks: Iterable[bytes]) -> int:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(".part")
        written = 0
        try:
            with open(temp_path, "wb") as f:
                for chunk in chunks:
                    f.write(chunk)
                    written += len(chunk)
            # Rename only when complete, so a crash never leaves a half-written
            # object under the real name.
            os.replace(temp_path, path)
        except BaseException:
            temp_path.unlink(missing_ok=True)
            raise
        return written

    def open(self, key: str) -> BinaryIO:
        return open(self._path(key), "rb")

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()
