"""Routes for the user's dashboard and activity log: /api/dashboard, /api/activity"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ActivityLog, BackupRun, User
from app.schemas import ActivityPage, DashboardStats
from app.security import get_current_user
from app.services import stats
from app.services.quota import get_used_bytes

router = APIRouter(prefix="/api", tags=["dashboard"])

# Activity categories the UI can filter by -> action prefix in the log.
CATEGORIES = {"file", "folder", "share", "backup", "user", "trash", "admin"}


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Everything the dashboard page shows, in one request."""
    backup_bytes = db.scalar(
        select(func.coalesce(func.sum(BackupRun.size), 0)).where(
            BackupRun.owner_id == user.id, BackupRun.status == "success"
        )
    )
    return DashboardStats(
        used_bytes=get_used_bytes(db, user.id),
        quota_bytes=user.quota_bytes,
        backup_bytes=int(backup_bytes),
        by_kind=stats.storage_by_kind(db, user.id),
        uploads_per_day=stats.uploads_per_day(db, user.id),
        **stats.counts(db, user.id),
    )


def activity_query(category: str | None):
    """Base query for the activity log, optionally limited to one category."""
    query = select(ActivityLog)
    if category in CATEGORIES:
        query = query.where(ActivityLog.action.startswith(f"{category}."))
    return query


@router.get("/activity", response_model=ActivityPage)
def my_activity(
    category: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Your own activity, newest first, page by page."""
    query = activity_query(category).where(ActivityLog.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(limit).offset(offset))
    return ActivityPage(items=list(items), total=total)
