"""Routes for the logged-in user's own profile: /api/users/me ..."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import MessageResponse, PasswordChange, UserOut, UserUpdate
from app.security import get_current_user, hash_password, verify_password
from app.services.activity import log_activity
from app.services.quota import get_used_bytes

router = APIRouter(prefix="/api/users", tags=["users"])


def to_user_out(db: Session, user: User) -> UserOut:
    """Build the public view of a user, including their current storage usage."""
    out = UserOut.model_validate(user)
    out.used_bytes = get_used_bytes(db, user.id)
    return out


@router.patch("/me", response_model=UserOut)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update your name and/or theme preference (light / dark / system)."""
    if data.name is not None:
        user.name = data.name.strip()
    if data.theme is not None:
        user.theme = data.theme
    db.commit()
    return to_user_out(db, user)


@router.post("/me/password", response_model=MessageResponse)
def change_password(
    data: PasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Change your password. The current password must be given again."""
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    log_activity(db, user, "user.password_change", "user", user.id, user.email, request=request)
    db.commit()
    return MessageResponse(message="Password updated")
