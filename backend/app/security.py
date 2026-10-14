"""
Authentication helpers: password hashing, JWT tokens and FastAPI
dependencies that protect routes.

How login works:
1. The user sends email + password to /api/auth/login.
2. We check the password against the bcrypt hash stored in the database.
3. If it matches, we return a signed JWT ("access token").
4. The frontend sends it back on every request in the header
   `Authorization: Bearer <token>`.
5. `get_current_user` verifies the signature and expiry and loads the user.
"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User

ALGORITHM = "HS256"  # HMAC-SHA256: the same secret key signs and verifies tokens

# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash a password with bcrypt. A random salt is generated every time,
    so two users with the same password still get different hashes."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Return True if `password` matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:  # malformed hash or password longer than 72 bytes
        return False


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------


def create_token(subject: str, token_type: str, expires_minutes: int, **extra) -> str:
    """Create a signed JWT.

    subject    - who/what the token is about (user id, file id, ...)
    token_type - "access" for logins; other types (e.g. "file") are used for
                 short-lived download links, so one kind can't be used as another.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
        **extra,
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict:
    """Verify a JWT's signature, expiry and type. Raises 401 if anything is wrong."""
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    if payload.get("type") != expected_type:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type")
    return payload


def create_access_token(user_id: int) -> str:
    return create_token(str(user_id), "access", get_settings().access_token_expire_minutes)


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

# auto_error=False so we can return our own 401 message instead of FastAPI's 403.
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: returns the logged-in user, or raises 401/403."""
    if credentials is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials, expected_type="access")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency: like get_current_user, but only lets admins through."""
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
