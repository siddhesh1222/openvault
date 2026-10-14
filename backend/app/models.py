"""
Database models (tables) for OpenVault.

Each class below becomes one table. Relationships between tables:

    User 1--* Folder            a user owns many folders (folders can nest)
    User 1--* File              a user owns many files
    File 1--* FileVersion       every upload of a file is stored as a version
    File/Folder 1--* ShareLink  public links (optional password + expiry)
    File/Folder 1--* UserShare  shared with a specific user (view / edit)
    User 1--* BackupJob 1--* BackupRun   scheduled backups and their results
    User 1--* ActivityLog       audit trail of what each user did

All timestamps are stored as UTC (without timezone info, because SQLite
cannot store it). The API adds the "Z" suffix when sending them out.
"""

from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    """Current time in UTC, as a naive datetime (see module docstring)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))  # bcrypt hash, never the password
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # admins can disable accounts
    quota_bytes: Mapped[int] = mapped_column(BigInteger)  # max storage this user may use
    theme: Mapped[str] = mapped_column(String(10), default="system")  # light / dark / system
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # parent_id = None means the folder sits at the top level ("My Files").
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)  # set = in Trash

    owner: Mapped[User] = relationship()


class File(Base):
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # folder_id = None means the file sits at the top level ("My Files").
    folder_id: Mapped[int | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(127), default="application/octet-stream")
    size: Mapped[int] = mapped_column(BigInteger, default=0)  # size of the current version
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)  # set = in Trash

    owner: Mapped[User] = relationship()
    # The newest version (highest version_no) is always the "current" one.
    versions: Mapped[list["FileVersion"]] = relationship(
        back_populates="file",
        order_by="FileVersion.version_no",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def current_version(self) -> "FileVersion | None":
        return self.versions[-1] if self.versions else None


class FileVersion(Base):
    __tablename__ = "file_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"), index=True)
    version_no: Mapped[int] = mapped_column(Integer)  # 1, 2, 3 ...
    storage_key: Mapped[str] = mapped_column(String(64), unique=True)  # random blob name on disk
    size: Mapped[int] = mapped_column(BigInteger)  # original (unencrypted) size in bytes
    sha256: Mapped[str] = mapped_column(String(64))  # checksum of the original bytes
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    file: Mapped[File] = relationship(back_populates="versions")


class ShareLink(Base):
    """A public link anyone can open (optionally password-protected / expiring).
    Exactly one of file_id / folder_id is set."""

    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # random, unguessable
    file_id: Mapped[int | None] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"))
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id", ondelete="CASCADE"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))  # None = no password
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)  # None = never expires
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    file: Mapped[File | None] = relationship()
    folder: Mapped[Folder | None] = relationship()


class UserShare(Base):
    """A file or folder shared with one specific registered user.
    Exactly one of file_id / folder_id is set."""

    __tablename__ = "user_shares"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[int | None] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"))
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id", ondelete="CASCADE"))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    permission: Mapped[str] = mapped_column(String(10), default="view")  # "view" or "edit"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    file: Mapped[File | None] = relationship()
    folder: Mapped[Folder | None] = relationship()
    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    target_user: Mapped[User] = relationship(foreign_keys=[target_user_id])


class BackupJob(Base):
    """A schedule that backs up one folder (or everything) daily or weekly."""

    __tablename__ = "backup_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # folder_id = None means "back up all of My Files".
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    frequency: Mapped[str] = mapped_column(String(10))  # "daily" or "weekly"
    hour: Mapped[int] = mapped_column(Integer, default=2)  # 0-23 (UTC)
    minute: Mapped[int] = mapped_column(Integer, default=0)  # 0-59
    weekday: Mapped[int | None] = mapped_column(Integer)  # 0=Mon .. 6=Sun, weekly only
    retention: Mapped[int] = mapped_column(Integer, default=7)  # how many backups to keep
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime)

    folder: Mapped[Folder | None] = relationship()
    runs: Mapped[list["BackupRun"]] = relationship(
        back_populates="job",
        order_by="BackupRun.started_at.desc()",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class BackupRun(Base):
    """One execution of a BackupJob and its result."""

    __tablename__ = "backup_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("backup_jobs.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="running")  # running/success/failed
    trigger: Mapped[str] = mapped_column(String(10), default="scheduled")  # scheduled/manual
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    size: Mapped[int] = mapped_column(BigInteger, default=0)  # size of the backup archive
    storage_key: Mapped[str | None] = mapped_column(String(64))  # encrypted zip on disk
    error: Mapped[str | None] = mapped_column(Text)  # reason, if status == "failed"

    job: Mapped[BackupJob] = relationship(back_populates="runs")


class ActivityLog(Base):
    """Audit trail: one row per important action (upload, share, login...)."""

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    action: Mapped[str] = mapped_column(String(50))  # e.g. "file.upload"
    target_type: Mapped[str | None] = mapped_column(String(20))  # file / folder / share / ...
    target_id: Mapped[int | None] = mapped_column(Integer)
    target_name: Mapped[str | None] = mapped_column(String(255))
    details: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    user: Mapped[User | None] = relationship()
