"""
File & folder logic: names, folder trees, uploads, versions and the Trash.

Routers call these functions and then `db.commit()`. Functions here never
commit by themselves, so one request = one transaction.
"""

import logging
import mimetypes
import os
from typing import BinaryIO

from fastapi import HTTPException, status
from sqlalchemy import event, func, select, update
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models import BackupJob, BackupRun, File, FileVersion, Folder, User, utcnow
from app.services import access
from app.services.quota import ensure_quota
from app.storage import get_storage
from app.storage.crypto import StoredBlob

logger = logging.getLogger(__name__)

# A MimeTypes object built from Python's own table (it does not read the
# Windows registry, so results are the same on every OS), plus a few extras.
_mime = mimetypes.MimeTypes()
for _type, _ext in [("image/webp", ".webp"), ("image/avif", ".avif"), ("text/markdown", ".md")]:
    _mime.add_type(_type, _ext)


# ---------------------------------------------------------------------------
# Deleting blobs safely
# ---------------------------------------------------------------------------
# We only delete encrypted blobs from disk AFTER the database commit succeeds.
# If we deleted first and the commit then failed, the database would point to
# files that no longer exist. Keys are parked in `session.info` and removed by
# the `after_commit` hook below.

_PENDING_KEY = "blobs_to_delete"


def delete_blob_after_commit(db: Session, storage_key: str) -> None:
    db.info.setdefault(_PENDING_KEY, []).append(storage_key)


@event.listens_for(Session, "after_commit")
def _delete_pending_blobs(session: Session) -> None:
    storage = get_storage()
    for key in session.info.pop(_PENDING_KEY, []):
        try:
            storage.delete(key)
        except Exception:  # never let cleanup break a request that already succeeded
            logger.exception("Could not delete blob %s", key)


@event.listens_for(Session, "after_rollback")
def _forget_pending_blobs(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)


# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------


def clean_name(name: str) -> str:
    """Validate a file/folder name typed by the user."""
    name = (name or "").strip()
    if not name or name in (".", ".."):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Name cannot be empty")
    if len(name) > 255:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Name is too long")
    if any(ch in name for ch in "/\\") or any(ord(ch) < 32 for ch in name):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Name contains invalid characters")
    return name


def guess_mime_type(name: str, fallback: str | None = None) -> str:
    return _mime.guess_type(name)[0] or fallback or "application/octet-stream"


def _in_folder(column, folder_id: int | None):
    """SQL condition "column = folder_id" that also works for the top level (NULL)."""
    return column.is_(None) if folder_id is None else column == folder_id


def name_taken(
    db: Session,
    owner_id: int,
    parent_id: int | None,
    name: str,
    *,
    skip_file_id: int | None = None,
    skip_folder_id: int | None = None,
) -> bool:
    """Is there already a file or folder called `name` (ignoring case) in this folder?"""
    lowered = name.lower()
    file_query = select(File.id).where(
        File.owner_id == owner_id,
        _in_folder(File.folder_id, parent_id),
        func.lower(File.name) == lowered,
        File.deleted_at.is_(None),
    )
    folder_query = select(Folder.id).where(
        Folder.owner_id == owner_id,
        _in_folder(Folder.parent_id, parent_id),
        func.lower(Folder.name) == lowered,
        Folder.deleted_at.is_(None),
    )
    if skip_file_id is not None:
        file_query = file_query.where(File.id != skip_file_id)
    if skip_folder_id is not None:
        folder_query = folder_query.where(Folder.id != skip_folder_id)
    return db.scalar(file_query.limit(1)) is not None or db.scalar(folder_query.limit(1)) is not None


def unique_name(db: Session, owner_id: int, parent_id: int | None, name: str, **skip) -> str:
    """Return `name`, or "name (1).ext", "name (2).ext"... if it is already taken."""
    stem, ext = os.path.splitext(name)
    candidate, counter = name, 1
    while name_taken(db, owner_id, parent_id, candidate, **skip):
        candidate = f"{stem} ({counter}){ext}"
        counter += 1
    return candidate


def ensure_name_free(db: Session, owner_id: int, parent_id: int | None, name: str, **skip) -> None:
    if name_taken(db, owner_id, parent_id, name, **skip):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f'An item named "{name}" already exists in this folder'
        )


# ---------------------------------------------------------------------------
# Looking things up (with permission checks)
# ---------------------------------------------------------------------------
# `need` is the permission level the action requires (see services/access.py).
# Users with NO access get 404 (not 403), so nobody can find out which ids
# exist. Users who can see the item but lack the level get 403.
# Items in the Trash are only visible to their owner.


def _check(permission: str | None, need: str, what: str) -> None:
    if permission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")
    if not access.allows(permission, need):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You need {need} permission for this {what.lower()}")


def get_folder(
    db: Session, user: User, folder_id: int, *, need: str = "owner", in_trash: bool = False
) -> Folder:
    folder = db.get(Folder, folder_id)
    if folder is None or (folder.deleted_at is not None) != in_trash:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Folder not found")
    _check(access.folder_permission(db, user, folder), "owner" if in_trash else need, "Folder")
    return folder


def get_file(
    db: Session, user: User, file_id: int, *, need: str = "owner", in_trash: bool = False
) -> File:
    file = db.get(File, file_id)
    if file is None or (file.deleted_at is not None) != in_trash:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    _check(access.file_permission(db, user, file), "owner" if in_trash else need, "File")
    return file


def breadcrumbs(db: Session, folder: Folder | None, *, start_at_id: int | None = None) -> list[dict]:
    """Path from the top level down to `folder`, e.g. [Documents, College, Sem 7].

    `start_at_id` cuts off everything above that folder. It is used for shared
    folders, so a guest only sees the path from the folder shared with them.
    """
    path = []
    while folder is not None:
        path.append({"id": folder.id, "name": folder.name})
        folder = db.get(Folder, folder.parent_id) if folder.parent_id else None
    path.reverse()
    ids = [crumb["id"] for crumb in path]
    if start_at_id in ids:
        path = path[ids.index(start_at_id):]
    return path


def descendant_folder_ids(db: Session, folder_id: int) -> list[int]:
    """Ids of every folder inside `folder_id` (children, grandchildren, ...)."""
    result, frontier = [], [folder_id]
    while frontier:  # breadth-first walk down the tree, one level per query
        children = db.scalars(select(Folder.id).where(Folder.parent_id.in_(frontier))).all()
        result.extend(children)
        frontier = list(children)
    return result


def is_inside(db: Session, folder_id: int | None, ancestor_id: int) -> bool:
    """True if `folder_id` is `ancestor_id` itself or somewhere below it."""
    while folder_id is not None:
        if folder_id == ancestor_id:
            return True
        folder_id = db.scalar(select(Folder.parent_id).where(Folder.id == folder_id))
    return False


def list_folder(db: Session, owner_id: int, folder_id: int | None) -> tuple[list[Folder], list[File]]:
    """Non-deleted sub-folders and files of one folder, sorted by name.

    `owner_id` is the owner of the folder being listed (which is not the
    current user when browsing a folder someone shared with them).
    """
    folders = db.scalars(
        select(Folder)
        .where(Folder.owner_id == owner_id, _in_folder(Folder.parent_id, folder_id), Folder.deleted_at.is_(None))
        .order_by(func.lower(Folder.name))
    ).all()
    files = db.scalars(
        select(File)
        .options(selectinload(File.versions))  # load versions in one extra query, not one per file
        .where(File.owner_id == owner_id, _in_folder(File.folder_id, folder_id), File.deleted_at.is_(None))
        .order_by(func.lower(File.name))
    ).all()
    return list(folders), list(files)


def search(db: Session, user: User, query: str, limit: int = 50) -> tuple[list[Folder], list[File]]:
    """Find non-deleted files and folders whose name contains `query` (any case)."""
    q = query.strip().lower()
    folders = db.scalars(
        select(Folder)
        .where(
            Folder.owner_id == user.id,
            Folder.deleted_at.is_(None),
            func.lower(Folder.name).contains(q, autoescape=True),  # autoescape: "%" and "_" match literally
        )
        .order_by(func.lower(Folder.name))
        .limit(limit)
    ).all()
    files = db.scalars(
        select(File)
        .options(selectinload(File.versions))
        .where(
            File.owner_id == user.id,
            File.deleted_at.is_(None),
            func.lower(File.name).contains(q, autoescape=True),
        )
        .order_by(File.updated_at.desc())
        .limit(limit)
    ).all()
    return list(folders), list(files)


# ---------------------------------------------------------------------------
# Uploads & versions
# ---------------------------------------------------------------------------


def _stream_size(source: BinaryIO) -> int:
    source.seek(0, os.SEEK_END)
    size = source.tell()
    source.seek(0)
    return size


def add_version(db: Session, file: File, blob: StoredBlob, actor: User) -> FileVersion:
    """Attach a newly stored blob to `file` as its newest version.

    Only the newest MAX_VERSIONS versions are kept; older blobs are deleted.
    """
    next_number = file.versions[-1].version_no + 1 if file.versions else 1
    version = FileVersion(
        version_no=next_number,
        storage_key=blob.key,
        size=blob.size,
        sha256=blob.sha256,
        created_by=actor.id,
    )
    file.versions.append(version)
    file.size = blob.size
    file.updated_at = utcnow()

    while len(file.versions) > get_settings().max_versions:
        oldest = file.versions.pop(0)  # delete-orphan cascade removes the row on flush
        delete_blob_after_commit(db, oldest.storage_key)
    return version


def upload_file(
    db: Session,
    *,
    owner: User,
    actor: User,
    folder_id: int | None,
    filename: str,
    source: BinaryIO,
    content_type: str | None,
) -> tuple[File, bool]:
    """Encrypt and store an uploaded file.

    If a file with the same name already exists in the folder, the upload
    becomes a new version of it. Returns (file, created) where created is
    False for a new version.
    `owner` pays the quota; `actor` is who uploaded (they differ when someone
    uploads into a folder shared with them).
    """
    # Browsers send just the file name, but older ones may send a full path.
    name = clean_name(filename.replace("\\", "/").split("/")[-1])

    check_upload_size(db, owner, _stream_size(source))

    existing = db.scalar(
        select(File).where(
            File.owner_id == owner.id,
            _in_folder(File.folder_id, folder_id),
            func.lower(File.name) == name.lower(),
            File.deleted_at.is_(None),
        )
    )
    if existing is None:
        # A *folder* with the same name would clash; files with the same name become versions.
        ensure_name_free(db, owner.id, folder_id, name)

    blob = get_storage().put(source)  # encrypts and writes to disk

    if existing is not None:
        file, created = existing, False
    else:
        file = File(
            owner_id=owner.id,
            folder_id=folder_id,
            name=name,
            mime_type=guess_mime_type(name, content_type),
        )
        db.add(file)
        created = True
    add_version(db, file, blob, actor)
    db.flush()  # assigns ids
    return file, created


def check_upload_size(db: Session, owner: User, size: int) -> None:
    """Reject files over the upload limit or over the owner's storage quota."""
    max_mb = get_settings().max_upload_mb
    if size > max_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, f"File is larger than the {max_mb} MB upload limit"
        )
    ensure_quota(db, owner, size)


def upload_new_version(db: Session, file: File, actor: User, source: BinaryIO) -> FileVersion:
    """Store `source` as the newest version of an existing file (keeps its name)."""
    check_upload_size(db, file.owner, _stream_size(source))
    return add_version(db, file, get_storage().put(source), actor)


def restore_version(db: Session, file: File, version: FileVersion, actor: User) -> FileVersion:
    """Make an old version current again by COPYING it as a new version.

    Nothing is overwritten, so the restore itself can be undone by restoring
    the version that was current before.
    """
    ensure_quota(db, file.owner, version.size)
    return add_version(db, file, get_storage().copy(version.storage_key), actor)


# ---------------------------------------------------------------------------
# Trash
# ---------------------------------------------------------------------------
# Moving a folder to the Trash stamps the SAME deleted_at time on the folder
# and everything inside it. Restoring brings back exactly the items with that
# timestamp, so things that were trashed separately earlier stay in the Trash.


def trash_folder(db: Session, folder: Folder) -> None:
    now = utcnow()
    folder_ids = [folder.id, *descendant_folder_ids(db, folder.id)]
    db.execute(
        update(Folder)
        .where(Folder.id.in_(folder_ids), Folder.deleted_at.is_(None))
        .values(deleted_at=now)
    )
    db.execute(
        update(File)
        .where(File.folder_id.in_(folder_ids), File.deleted_at.is_(None))
        .values(deleted_at=now)
    )
    db.refresh(folder)


def _parent_is_live(db: Session, parent_id: int | None) -> bool:
    if parent_id is None:
        return True
    return db.scalar(select(Folder.deleted_at).where(Folder.id == parent_id)) is None


def restore_folder(db: Session, folder: Folder) -> None:
    stamp = folder.deleted_at
    folder_ids = [folder.id, *descendant_folder_ids(db, folder.id)]
    # If the parent folder is itself in the Trash, restore to the top level instead.
    if not _parent_is_live(db, folder.parent_id):
        folder.parent_id = None
    folder.name = unique_name(db, folder.owner_id, folder.parent_id, folder.name)
    db.flush()  # save the two changes above before the bulk updates + refresh below
    db.execute(
        update(Folder).where(Folder.id.in_(folder_ids), Folder.deleted_at == stamp).values(deleted_at=None)
    )
    db.execute(
        update(File).where(File.folder_id.in_(folder_ids), File.deleted_at == stamp).values(deleted_at=None)
    )
    db.refresh(folder)


def restore_file(db: Session, file: File) -> None:
    if not _parent_is_live(db, file.folder_id):
        file.folder_id = None
    file.name = unique_name(db, file.owner_id, file.folder_id, file.name)
    file.deleted_at = None


def list_trash(db: Session, user: User) -> tuple[list[Folder], list[File]]:
    """Items to show in the Trash: only the "top" of each trashed group.

    E.g. if folder "College" was trashed with 20 files inside, we show just
    "College", not all 21 items.
    """
    folders = db.scalars(
        select(Folder).where(Folder.owner_id == user.id, Folder.deleted_at.is_not(None))
    ).all()
    files = db.scalars(
        select(File)
        .options(selectinload(File.versions))
        .where(File.owner_id == user.id, File.deleted_at.is_not(None))
    ).all()
    deleted_at_by_folder = {f.id: f.deleted_at for f in folders}

    def is_top(parent_id, deleted_at) -> bool:
        return deleted_at_by_folder.get(parent_id) != deleted_at

    top_folders = [f for f in folders if is_top(f.parent_id, f.deleted_at)]
    top_files = [f for f in files if is_top(f.folder_id, f.deleted_at)]
    top_folders.sort(key=lambda f: f.deleted_at, reverse=True)
    top_files.sort(key=lambda f: f.deleted_at, reverse=True)
    return top_folders, top_files


def delete_file_forever(db: Session, file: File) -> None:
    for version in file.versions:
        delete_blob_after_commit(db, version.storage_key)
    db.delete(file)


def delete_folder_forever(db: Session, folder: Folder) -> None:
    """Delete a folder, everything inside it, and backups of those folders."""
    folder_ids = [folder.id, *descendant_folder_ids(db, folder.id)]
    version_keys = db.scalars(
        select(FileVersion.storage_key).join(File).where(File.folder_id.in_(folder_ids))
    ).all()
    backup_keys = db.scalars(
        select(BackupRun.storage_key)
        .join(BackupJob)
        .where(BackupJob.folder_id.in_(folder_ids), BackupRun.storage_key.is_not(None))
    ).all()
    for key in [*version_keys, *backup_keys]:
        delete_blob_after_commit(db, key)
    # The database removes sub-folders, files, versions and backup jobs for us
    # through ON DELETE CASCADE foreign keys.
    db.delete(folder)
