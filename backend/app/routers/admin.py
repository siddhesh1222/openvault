"""
Admin panel routes: /api/admin/...  (every route requires an admin account)

Admins can see all users, change storage quotas, disable or enable
accounts, grant admin rights, delete users and read the system-wide
activity log. An admin can never disable, demote or delete THEMSELVES,
so the server can't end up with no admin at all by accident.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ActivityLog, BackupRun, File, FileVersion, ShareLink, User
from app.routers.dashboard import activity_query
from app.schemas import ActivityOut, ActivityPage, AdminStats, AdminUserOut, AdminUserUpdate, MessageResponse
from app.security import require_admin
from app.services.activity import log_activity
from app.services.file_service import delete_blob_after_commit
from app.services.quota import get_used_bytes

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _admin_user_out(db: Session, user: User, file_counts: dict, last_logins: dict) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        is_admin=user.is_admin,
        is_active=user.is_active,
        quota_bytes=user.quota_bytes,
        used_bytes=get_used_bytes(db, user.id),
        file_count=file_counts.get(user.id, 0),
        created_at=user.created_at,
        last_login_at=last_logins.get(user.id),
    )


def _file_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(File.owner_id, func.count(File.id)).where(File.deleted_at.is_(None)).group_by(File.owner_id)
    )
    return dict(rows.all())


def _last_logins(db: Session) -> dict:
    rows = db.execute(
        select(ActivityLog.user_id, func.max(ActivityLog.created_at))
        .where(ActivityLog.action.in_(["user.login", "user.register"]))
        .group_by(ActivityLog.user_id)
    )
    return dict(rows.all())


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("/stats", response_model=AdminStats)
def system_stats(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    """Totals for the whole server."""
    users = db.scalars(select(User)).all()
    return AdminStats(
        user_count=len(users),
        active_user_count=sum(u.is_active for u in users),
        admin_count=sum(u.is_admin for u in users),
        file_count=db.scalar(select(func.count(File.id)).where(File.deleted_at.is_(None))),
        total_used_bytes=sum(get_used_bytes(db, u.id) for u in users),
        total_quota_bytes=sum(u.quota_bytes for u in users),
        backup_count=db.scalar(select(func.count(BackupRun.id)).where(BackupRun.status == "success")),
        share_link_count=db.scalar(select(func.count(ShareLink.id))),
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    q: str | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """All users (optionally filtered by name/email), newest first."""
    query = select(User).order_by(User.created_at.desc())
    if q:
        pattern = q.strip().lower()
        query = query.where(
            func.lower(User.email).contains(pattern, autoescape=True)
            | func.lower(User.name).contains(pattern, autoescape=True)
        )
    file_counts, last_logins = _file_counts(db), _last_logins(db)
    return [_admin_user_out(db, u, file_counts, last_logins) for u in db.scalars(query)]


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    data: AdminUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Change a user's quota, enable/disable the account, or grant/revoke admin."""
    user = _get_user(db, user_id)
    if user.id == admin.id and (data.is_active is False or data.is_admin is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't disable or demote your own account")

    changes = []
    if data.quota_bytes is not None and data.quota_bytes != user.quota_bytes:
        user.quota_bytes = data.quota_bytes
        mb = data.quota_bytes // (1024 * 1024)
        changes.append(f"quota {mb / 1024:g} GB" if mb >= 1024 else f"quota {mb} MB")
    if data.is_active is not None and data.is_active != user.is_active:
        user.is_active = data.is_active
        changes.append("enabled" if data.is_active else "disabled")
    if data.is_admin is not None and data.is_admin != user.is_admin:
        user.is_admin = data.is_admin
        changes.append("made admin" if data.is_admin else "admin removed")

    if changes:
        log_activity(db, admin, "admin.user_update", "user", user.id, user.email,
                     details=", ".join(changes), request=request)
    db.commit()
    return _admin_user_out(db, user, _file_counts(db), _last_logins(db))


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a user and ALL of their files, versions, shares and backups."""
    user = _get_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't delete your own account")

    # Remove the encrypted data from disk (after the commit succeeds).
    version_keys = db.scalars(
        select(FileVersion.storage_key).join(File, FileVersion.file_id == File.id).where(File.owner_id == user.id)
    ).all()
    backup_keys = db.scalars(
        select(BackupRun.storage_key).where(BackupRun.owner_id == user.id, BackupRun.storage_key.is_not(None))
    ).all()
    for key in [*version_keys, *backup_keys]:
        delete_blob_after_commit(db, key)

    email = user.email
    log_activity(db, admin, "admin.user_delete", "user", user.id, email, request=request)
    db.delete(user)  # ON DELETE CASCADE removes folders, files, shares, jobs, logs...
    db.commit()
    return MessageResponse(message=f"{email} and all of their data were deleted")


@router.get("/activity", response_model=ActivityPage)
def system_activity(
    category: str | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Activity of ALL users (audit log), newest first."""
    query = activity_query(category)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    logs = db.scalars(query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(limit).offset(offset))
    items = []
    for log in logs:
        out = ActivityOut.model_validate(log)
        if log.user:
            out.user_name, out.user_email = log.user.name, log.user.email
        items.append(out)
    return ActivityPage(items=items, total=total)
