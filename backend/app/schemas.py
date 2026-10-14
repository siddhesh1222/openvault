"""
Pydantic schemas: the shape of data going in and out of the API.

Request schemas validate what the client sends (e.g. password length).
Response schemas control exactly which fields are returned, so secrets
like `password_hash` can never leak out by accident.
"""

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    PlainSerializer,
    field_validator,
    model_validator,
)


def _to_utc_iso(value: datetime) -> str:
    """Database times are naive UTC; mark them as UTC ("...Z") for the browser."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


# Use this instead of `datetime` in response schemas.
UTCDateTime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str)]

Theme = Literal["light", "dark", "system"]


class ORMModel(BaseModel):
    """Base for response schemas that are built from SQLAlchemy objects."""

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Auth & users
# ---------------------------------------------------------------------------


def _check_password_bytes(value: str) -> str:
    # bcrypt only uses the first 72 *bytes*; reject longer passwords instead of
    # silently ignoring the rest.
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password is too long (max 72 bytes)")
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=72)

    _password_bytes = field_validator("password")(_check_password_bytes)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be empty")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORMModel):
    id: int
    email: str
    name: str
    is_admin: bool
    is_active: bool
    quota_bytes: int
    used_bytes: int = 0  # filled in by the router, not stored in the users table
    theme: str
    created_at: UTCDateTime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserUpdate(BaseModel):
    """Fields a user may change on their own profile (all optional)."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    theme: Theme | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)

    _password_bytes = field_validator("new_password")(_check_password_bytes)


class MessageResponse(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Files & folders
# ---------------------------------------------------------------------------


class FolderOut(ORMModel):
    id: int
    name: str
    parent_id: int | None
    created_at: UTCDateTime
    deleted_at: UTCDateTime | None = None
    shared: bool = False  # owner has shared it (link or user); shown as a badge


class FileOut(ORMModel):
    id: int
    name: str
    folder_id: int | None
    mime_type: str
    size: int
    version_count: int
    created_at: UTCDateTime
    updated_at: UTCDateTime
    deleted_at: UTCDateTime | None = None
    shared: bool = False


class Breadcrumb(BaseModel):
    id: int
    name: str


class FolderContents(BaseModel):
    """Everything the "My Files" page needs for one folder, in one request."""

    folder: FolderOut | None  # None = top level ("My Files")
    breadcrumbs: list[Breadcrumb]  # path from the top level down to this folder
    permission: str  # what the current user may do here: owner / edit / view
    folders: list[FolderOut]
    files: list[FileOut]


class ItemList(BaseModel):
    """A mixed list of folders and files (used by Trash and Search)."""

    folders: list[FolderOut]
    files: list[FileOut]


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: int | None = None


class FolderUpdate(BaseModel):
    """Rename and/or move a folder. Send only the fields you want to change;
    `"parent_id": null` moves the folder to the top level."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: int | None = None


class FileUpdate(BaseModel):
    """Rename and/or move a file. `"folder_id": null` moves it to the top level."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    folder_id: int | None = None


class FileLinks(BaseModel):
    """Short-lived URLs that work without the Authorization header
    (for <img>/<video> previews and normal browser downloads)."""

    preview_url: str
    download_url: str
    expires_at: UTCDateTime


# ---------------------------------------------------------------------------
# Sharing
# ---------------------------------------------------------------------------

Permission = Literal["view", "edit"]


def to_naive_utc(value: datetime | None) -> datetime | None:
    """The browser sends times with a timezone; the database stores naive UTC."""
    if value is not None and value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class ShareTarget(BaseModel):
    """What is being shared: exactly one of file_id / folder_id."""

    file_id: int | None = None
    folder_id: int | None = None

    @model_validator(mode="after")
    def exactly_one_target(self):
        if (self.file_id is None) == (self.folder_id is None):
            raise ValueError("Give exactly one of file_id or folder_id")
        return self


class ShareLinkCreate(ShareTarget):
    password: str | None = Field(default=None, min_length=4, max_length=72)
    expires_at: datetime | None = None  # None = never expires

    _naive = field_validator("expires_at")(to_naive_utc)


class ShareLinkUpdate(BaseModel):
    """Change a link. Send `"password": null` to remove the password and
    `"expires_at": null` to make it never expire; leave a field out to keep it."""

    password: str | None = Field(default=None, min_length=4, max_length=72)
    expires_at: datetime | None = None

    _naive = field_validator("expires_at")(to_naive_utc)


class ShareLinkOut(ORMModel):
    id: int
    token: str
    url: str  # e.g. "/s/abc123" (the frontend adds its own origin)
    file_id: int | None
    folder_id: int | None
    has_password: bool
    expires_at: UTCDateTime | None
    is_expired: bool
    download_count: int
    created_at: UTCDateTime


class UserBrief(ORMModel):
    id: int
    name: str
    email: str


class UserShareCreate(ShareTarget):
    email: EmailStr
    permission: Permission = "view"


class UserShareUpdate(BaseModel):
    permission: Permission


class UserShareOut(ORMModel):
    id: int
    file_id: int | None
    folder_id: int | None
    permission: str
    created_at: UTCDateTime
    target_user: UserBrief


class SharedItemOut(BaseModel):
    """One entry on the "Shared with me" page."""

    share_id: int
    permission: str
    shared_at: UTCDateTime
    owner: UserBrief
    file: FileOut | None = None
    folder: FolderOut | None = None


class SharedWithMe(BaseModel):
    items: list[SharedItemOut]


# ---------------------------------------------------------------------------
# Public share pages (no login)
# ---------------------------------------------------------------------------


class ShareUnlock(BaseModel):
    password: str


class ShareUnlockResponse(BaseModel):
    access: str  # short-lived token to pass as ?access=... on the next requests


class PublicShare(BaseModel):
    """What a visitor of /s/<token> sees. While the link is locked by a
    password, only `requires_password` and `owner_name` are filled in."""

    type: Literal["file", "folder"]
    owner_name: str
    requires_password: bool
    name: str | None = None
    expires_at: UTCDateTime | None = None
    file: FileOut | None = None  # for file links
    contents: FolderContents | None = None  # for folder links

# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------


class VersionOut(BaseModel):
    id: int
    version_no: int
    size: int
    sha256: str
    created_at: UTCDateTime
    created_by_name: str | None  # None if that user was deleted
    is_current: bool


# ---------------------------------------------------------------------------
# Backups
# ---------------------------------------------------------------------------

Frequency = Literal["daily", "weekly"]


class BackupJobCreate(BaseModel):
    """A backup schedule. Times are in UTC; weekday 0 = Monday ... 6 = Sunday."""

    name: str = Field(min_length=1, max_length=100)
    folder_id: int | None = None  # None = back up all of My Files
    frequency: Frequency = "daily"
    hour: int = Field(default=2, ge=0, le=23)
    minute: int = Field(default=0, ge=0, le=59)
    weekday: int | None = Field(default=None, ge=0, le=6)
    retention: int = Field(default=7, ge=1, le=30)  # how many successful backups to keep
    enabled: bool = True

    @model_validator(mode="after")
    def weekly_needs_weekday(self):
        if self.frequency == "weekly" and self.weekday is None:
            raise ValueError("Weekly backups need a weekday (0 = Monday ... 6 = Sunday)")
        return self


class BackupJobUpdate(BaseModel):
    """Change a schedule; only the fields that are sent are changed."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    frequency: Frequency | None = None
    hour: int | None = Field(default=None, ge=0, le=23)
    minute: int | None = Field(default=None, ge=0, le=59)
    weekday: int | None = Field(default=None, ge=0, le=6)
    retention: int | None = Field(default=None, ge=1, le=30)
    enabled: bool | None = None


class BackupRunOut(BaseModel):
    id: int
    job_id: int
    job_name: str
    status: str  # running / success / failed
    trigger: str  # scheduled / manual
    started_at: UTCDateTime
    finished_at: UTCDateTime | None
    file_count: int
    size: int
    error: str | None


class BackupJobOut(BaseModel):
    id: int
    name: str
    folder_id: int | None
    folder_name: str  # "My Files" when the whole drive is backed up
    frequency: str
    hour: int
    minute: int
    weekday: int | None
    retention: int
    enabled: bool
    created_at: UTCDateTime
    last_run_at: UTCDateTime | None
    next_run_at: UTCDateTime | None  # None when the schedule is paused
    last_status: str | None

# ---------------------------------------------------------------------------
# Dashboard & activity
# ---------------------------------------------------------------------------


class KindStat(BaseModel):
    kind: str  # image / video / audio / document / archive / code / other
    label: str
    bytes: int
    count: int


class DayStat(BaseModel):
    date: str  # YYYY-MM-DD (UTC)
    count: int
    bytes: int


class DashboardStats(BaseModel):
    used_bytes: int
    quota_bytes: int
    file_count: int
    folder_count: int
    shared_count: int  # links + people the user shared with
    shared_with_me_count: int
    trash_bytes: int
    backup_bytes: int
    by_kind: list[KindStat]
    uploads_per_day: list[DayStat]


class ActivityOut(ORMModel):
    id: int
    action: str  # e.g. "file.upload"
    target_type: str | None
    target_id: int | None
    target_name: str | None
    details: str | None
    ip_address: str | None
    created_at: UTCDateTime
    user_name: str | None = None  # filled in for the admin's system-wide log
    user_email: str | None = None


class ActivityPage(BaseModel):
    items: list[ActivityOut]
    total: int


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class AdminUserOut(BaseModel):
    id: int
    name: str
    email: str
    is_admin: bool
    is_active: bool
    quota_bytes: int
    used_bytes: int
    file_count: int
    created_at: UTCDateTime
    last_login_at: UTCDateTime | None


class AdminUserUpdate(BaseModel):
    """Fields an admin can change on any account (only the ones sent are changed)."""

    quota_bytes: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    is_admin: bool | None = None


class AdminStats(BaseModel):
    user_count: int
    active_user_count: int
    admin_count: int
    file_count: int
    total_used_bytes: int
    total_quota_bytes: int
    backup_count: int
    share_link_count: int