"""Numbers for the dashboard: storage by file type, uploads per day, counts."""

from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import File, FileVersion, Folder, ShareLink, UserShare, utcnow

# Order = order shown in the chart legend.
KIND_LABELS = {
    "image": "Images",
    "video": "Videos",
    "audio": "Audio",
    "document": "Documents",
    "archive": "Archives",
    "code": "Code",
    "other": "Other",
}

_DOCUMENT_EXT = (".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".odp", ".ods")
_ARCHIVE_EXT = (".zip", ".rar", ".7z", ".tar", ".gz", ".bz2")
_CODE_EXT = (".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".cpp", ".h", ".cs", ".go", ".rs", ".rb",
             ".php", ".html", ".css", ".json", ".xml", ".yml", ".yaml", ".sh", ".sql")


def file_kind(name: str, mime_type: str) -> str:
    """Put a file into one of the KIND_LABELS groups (by MIME type, then extension)."""
    lower = name.lower()
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("audio/"):
        return "audio"
    if lower.endswith(_ARCHIVE_EXT):
        return "archive"
    if lower.endswith(_CODE_EXT):
        return "code"
    if lower.endswith(_DOCUMENT_EXT) or mime_type.startswith("text/"):
        return "document"
    return "other"


def storage_by_kind(db: Session, owner_id: int) -> list[dict]:
    """Size and count of the user's files (current versions, not in Trash) per kind."""
    totals = defaultdict(lambda: {"bytes": 0, "count": 0})
    rows = db.execute(
        select(File.name, File.mime_type, File.size).where(File.owner_id == owner_id, File.deleted_at.is_(None))
    )
    for name, mime_type, size in rows:
        bucket = totals[file_kind(name, mime_type)]
        bucket["bytes"] += size
        bucket["count"] += 1
    return [
        {"kind": kind, "label": label, "bytes": totals[kind]["bytes"], "count": totals[kind]["count"]}
        for kind, label in KIND_LABELS.items()
        if totals[kind]["count"]
    ]


def uploads_per_day(db: Session, owner_id: int, days: int = 14) -> list[dict]:
    """Uploads (new files and new versions) for each of the last `days` days, oldest first.

    Grouping by day is done in Python so it works the same on SQLite and PostgreSQL.
    """
    today = utcnow().date()
    start = today - timedelta(days=days - 1)
    per_day = {start + timedelta(days=i): {"count": 0, "bytes": 0} for i in range(days)}
    rows = db.execute(
        select(FileVersion.created_at, FileVersion.size)
        .join(File, FileVersion.file_id == File.id)
        .where(File.owner_id == owner_id, FileVersion.created_at >= start)
    )
    for created_at, size in rows:
        day = per_day.get(created_at.date())
        if day is not None:
            day["count"] += 1
            day["bytes"] += size
    return [{"date": d.isoformat(), **values} for d, values in per_day.items()]


def counts(db: Session, owner_id: int) -> dict:
    """How many files, folders and shared items the user has (Trash excluded)."""
    file_count = db.scalar(select(func.count(File.id)).where(File.owner_id == owner_id, File.deleted_at.is_(None)))
    folder_count = db.scalar(select(func.count(Folder.id)).where(Folder.owner_id == owner_id, Folder.deleted_at.is_(None)))
    link_count = db.scalar(select(func.count(ShareLink.id)).where(ShareLink.created_by == owner_id))
    user_share_count = db.scalar(select(func.count(UserShare.id)).where(UserShare.owner_id == owner_id))
    shared_with_me = db.scalar(select(func.count(UserShare.id)).where(UserShare.target_user_id == owner_id))
    trash_bytes = db.scalar(
        select(func.coalesce(func.sum(File.size), 0)).where(File.owner_id == owner_id, File.deleted_at.is_not(None))
    )
    return {
        "file_count": file_count,
        "folder_count": folder_count,
        "shared_count": link_count + user_share_count,
        "shared_with_me_count": shared_with_me,
        "trash_bytes": int(trash_bytes),
    }
