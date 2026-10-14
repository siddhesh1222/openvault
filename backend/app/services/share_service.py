"""
Sharing logic: public links and sharing with specific users.

Public links
    A ShareLink has a random token (e.g. /s/Xk3...). Anyone with the URL can
    open it, unless it has expired. If it has a password, the visitor first
    calls /unlock with the password and receives a short-lived "share"
    token, which must be sent with every following request.

User shares
    A UserShare gives one registered user "view" or "edit" access to a file
    or folder (see services/access.py for what each level allows).
"""

import hashlib
import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import File, Folder, ShareLink, User, UserShare
from app.schemas import ShareTarget
from app.security import create_token, decode_token, verify_password
from app.services import file_service as fs

UNLOCK_MINUTES = 60  # how long a correct password keeps a link unlocked


def get_owned_target(db: Session, user: User, target: ShareTarget) -> tuple[File | None, Folder | None]:
    """Load the file or folder being shared. Only the owner may share."""
    if target.file_id is not None:
        return fs.get_file(db, user, target.file_id, need="owner"), None
    return None, fs.get_folder(db, user, target.folder_id, need="owner")


def target_filter(model, target: ShareTarget):
    """SQL condition matching shares of exactly this file or folder."""
    if target.file_id is not None:
        return model.file_id == target.file_id
    return model.folder_id == target.folder_id


def new_token() -> str:
    """32 URL-safe characters from a cryptographically secure random source
    (192 bits: impossible to guess)."""
    return secrets.token_urlsafe(24)


def shared_ids(db: Session, owner_id: int) -> tuple[set[int], set[int]]:
    """(file ids, folder ids) that `owner_id` has shared by link or with a user."""
    file_ids: set[int] = set()
    folder_ids: set[int] = set()
    for model, owner_column in ((ShareLink, ShareLink.created_by), (UserShare, UserShare.owner_id)):
        for file_id, folder_id in db.execute(
            select(model.file_id, model.folder_id).where(owner_column == owner_id)
        ):
            if file_id:
                file_ids.add(file_id)
            if folder_id:
                folder_ids.add(folder_id)
    return file_ids, folder_ids


# ---------------------------------------------------------------------------
# Public link access
# ---------------------------------------------------------------------------


def find_active_link(db: Session, token: str) -> ShareLink:
    """Load a link by its token; 404 if unknown or its item is gone, 410 if expired."""
    link = db.scalar(select(ShareLink).where(ShareLink.token == token))
    item = (link.file or link.folder) if link else None
    if link is None or item is None or item.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This link does not exist or was removed")
    if link.is_expired:
        raise HTTPException(status.HTTP_410_GONE, "This link has expired")
    return link


def _password_fingerprint(link: ShareLink) -> str:
    """A short value that changes whenever the link's password changes.

    It is put inside unlock tokens, so changing or removing the password
    immediately invalidates everyone's earlier unlocks.
    """
    return hashlib.sha256((link.password_hash or "").encode()).hexdigest()[:16]


def unlock(link: ShareLink, password: str) -> str:
    """Check a link's password and return a short-lived access token."""
    if link.password_hash is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This link has no password")
    if not verify_password(password, link.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong password")
    return create_token(str(link.id), "share", UNLOCK_MINUTES, fp=_password_fingerprint(link))


def is_unlocked(link: ShareLink, access: str | None) -> bool:
    """True if the link has no password, or `access` is a valid unlock token for it."""
    if link.password_hash is None:
        return True
    if not access:
        return False
    try:
        payload = decode_token(access, expected_type="share")
    except HTTPException:
        return False
    return payload["sub"] == str(link.id) and payload.get("fp") == _password_fingerprint(link)


def require_unlocked(link: ShareLink, access: str | None) -> None:
    if not is_unlocked(link, access):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password required")


def public_folder(db: Session, link: ShareLink, folder_id: int | None) -> Folder:
    """The folder a visitor wants to open, which must be inside the shared folder."""
    if folder_id is None or folder_id == link.folder_id:
        return link.folder
    folder = db.get(Folder, folder_id)
    if folder is None or folder.deleted_at is not None or not fs.is_inside(db, folder.id, link.folder_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Folder not found")
    return folder


def public_file(db: Session, link: ShareLink, file_id: int) -> File:
    """A file a visitor wants to download, which must be the shared file or inside the shared folder."""
    file = db.get(File, file_id)
    allowed = file is not None and file.deleted_at is None and (
        file.id == link.file_id
        if link.file_id is not None
        else file.folder_id is not None and fs.is_inside(db, file.folder_id, link.folder_id)
    )
    if not allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return file
