"""Activity log: records who did what, and when (shown on the dashboard)."""

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import ActivityLog, User


def log_activity(
    db: Session,
    user: User | None,
    action: str,
    target_type: str | None = None,
    target_id: int | None = None,
    target_name: str | None = None,
    details: str | None = None,
    request: Request | None = None,
) -> None:
    """Add an activity entry to the session.

    It is saved together with the caller's next `db.commit()`, so the log entry
    and the action it describes are stored in the same transaction.
    """
    ip = request.client.host if request is not None and request.client else None
    db.add(
        ActivityLog(
            user_id=user.id if user else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            details=details,
            ip_address=ip,
        )
    )
