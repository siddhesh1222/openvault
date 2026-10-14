"""
Pydantic schemas: the shape of data going in and out of the API.

Request schemas validate what the client sends (e.g. password length).
Response schemas control exactly which fields are returned, so secrets
like `password_hash` can never leak out by accident.
"""

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer, field_validator


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
