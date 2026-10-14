"""
Who may do what with a file or folder.

Permission levels, from weakest to strongest:
    "view"  - open, preview and download
    "edit"  - view + rename, upload files / new versions, create sub-folders
    "owner" - everything, including move, delete and sharing

A user gets a level by owning the item, by a UserShare on the item itself,
or by a UserShare on ANY folder above it (sharing a folder shares
everything inside it). If several shares apply, the strongest one wins.
"""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import File, Folder, User, UserShare

LEVELS = {"view": 1, "edit": 2, "owner": 3}


def ancestor_ids(db: Session, folder_id: int | None) -> list[int]:
    """[folder_id, its parent, grandparent, ...] up to the top level."""
    ids = []
    while folder_id is not None:
        ids.append(folder_id)
        folder_id = db.scalar(select(Folder.parent_id).where(Folder.id == folder_id))
    return ids


def _strongest(permissions) -> str | None:
    best = None
    for permission in permissions:
        if best is None or LEVELS[permission] > LEVELS[best]:
            best = permission
    return best


def folder_permission(db: Session, user: User, folder: Folder) -> str | None:
    if folder.owner_id == user.id:
        return "owner"
    shares = db.scalars(
        select(UserShare.permission).where(
            UserShare.target_user_id == user.id,
            UserShare.folder_id.in_(ancestor_ids(db, folder.id)),
        )
    )
    return _strongest(shares)


def file_permission(db: Session, user: User, file: File) -> str | None:
    if file.owner_id == user.id:
        return "owner"
    shares = db.scalars(
        select(UserShare.permission).where(
            UserShare.target_user_id == user.id,
            or_(
                UserShare.file_id == file.id,
                UserShare.folder_id.in_(ancestor_ids(db, file.folder_id)),
            ),
        )
    )
    return _strongest(shares)


def shared_root_id(db: Session, user: User, folder: Folder) -> int | None:
    """The highest folder above (or equal to) `folder` that was shared with `user`.

    Guests browsing a shared folder see breadcrumbs starting from here.
    """
    path = ancestor_ids(db, folder.id)  # bottom -> top
    shared = set(
        db.scalars(
            select(UserShare.folder_id).where(
                UserShare.target_user_id == user.id, UserShare.folder_id.in_(path)
            )
        )
    )
    for folder_id in reversed(path):  # top -> bottom: first match is the highest
        if folder_id in shared:
            return folder_id
    return None


def allows(permission: str | None, need: str) -> bool:
    """Does `permission` include the `need` level? (e.g. "edit" allows "view")"""
    return permission is not None and LEVELS[permission] >= LEVELS[need]
