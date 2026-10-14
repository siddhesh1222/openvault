"""Routes for registering, logging in and fetching the current user: /api/auth/..."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.routers.users import to_user_out
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.security import create_access_token, get_current_user, hash_password, verify_password
from app.services.activity import log_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Used when the email doesn't exist, so a failed login takes the same time
# either way (an attacker can't tell which emails are registered by timing).
_DUMMY_HASH = hash_password("dummy-password-for-timing")


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    """Create a new account and log the user in straight away."""
    settings = get_settings()
    email = data.email.lower()

    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # The very first account becomes the admin, so a fresh install can be
    # managed without touching the database. ADMIN_EMAIL can also name one.
    is_first_user = db.scalar(select(func.count(User.id))) == 0
    is_admin = is_first_user or (
        settings.admin_email is not None and email == settings.admin_email.lower()
    )

    user = User(
        email=email,
        name=data.name,
        password_hash=hash_password(data.password),
        is_admin=is_admin,
        quota_bytes=settings.default_quota_mb * 1024 * 1024,
    )
    db.add(user)
    db.flush()  # assigns user.id so the activity log can reference it
    log_activity(db, user, "user.register", "user", user.id, user.email, request=request)
    db.commit()

    return TokenResponse(access_token=create_access_token(user.id), user=to_user_out(db, user))


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Check email + password and return a JWT access token."""
    user = db.scalar(select(User).where(User.email == data.email.lower()))

    password_ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not password_ok:
        # Same message for both cases: don't reveal whether the email exists.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    log_activity(db, user, "user.login", "user", user.id, user.email, request=request)
    db.commit()
    return TokenResponse(access_token=create_access_token(user.id), user=to_user_out(db, user))


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return the logged-in user (the frontend calls this on page load)."""
    return to_user_out(db, user)
