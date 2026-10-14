"""Storage quota: how much space a user is using, and whether a new upload fits."""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import BackupRun, File, FileVersion, User


def get_used_bytes(db: Session, user_id: int) -> int:
    """Total bytes used = every stored file version + every stored backup.

    Files in the Trash still count, because their data is still on disk
    until they are permanently deleted.
    """
    versions_total = db.scalar(
        select(func.coalesce(func.sum(FileVersion.size), 0))
        .join(File, FileVersion.file_id == File.id)
        .where(File.owner_id == user_id)
    )
    backups_total = db.scalar(
        select(func.coalesce(func.sum(BackupRun.size), 0)).where(
            BackupRun.owner_id == user_id, BackupRun.status == "success"
        )
    )
    return int(versions_total) + int(backups_total)


def ensure_quota(db: Session, user: User, extra_bytes: int) -> None:
    """Raise 413 if adding `extra_bytes` would push the user over their quota."""
    if get_used_bytes(db, user.id) + extra_bytes > user.quota_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Storage quota exceeded. Delete some files or ask an admin for more space.",
        )
