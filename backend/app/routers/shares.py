"""Routes for managing shares (logged-in users): /api/shares/..."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import File, Folder, ShareLink, User, UserShare, utcnow
from app.schemas import (
    MessageResponse,
    SharedItemOut,
    SharedWithMe,
    ShareLinkCreate,
    ShareLinkOut,
    ShareLinkUpdate,
    ShareTarget,
    UserShareCreate,
    UserShareOut,
    UserShareUpdate,
)
from app.security import get_current_user, hash_password
from app.services import share_service as ss
from app.services.activity import log_activity

router = APIRouter(prefix="/api/shares", tags=["shares"])


def _target_from_query(file_id: int | None = None, folder_id: int | None = None) -> ShareTarget:
    """Read ?file_id= or ?folder_id= from the URL as a ShareTarget."""
    try:
        return ShareTarget(file_id=file_id, folder_id=folder_id)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Give exactly one of file_id or folder_id")


def _check_future(expires_at) -> None:
    if expires_at is not None and expires_at <= utcnow():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Expiry date must be in the future")


# ---------------------------------------------------------------------------
# Public links
# ---------------------------------------------------------------------------


@router.get("/links", response_model=list[ShareLinkOut])
def list_links(
    target: ShareTarget = Depends(_target_from_query),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All public links of one file or folder (for the share dialog)."""
    ss.get_owned_target(db, user, target)
    return db.scalars(
        select(ShareLink).where(ss.target_filter(ShareLink, target)).order_by(ShareLink.created_at)
    ).all()


@router.post("/links", response_model=ShareLinkOut, status_code=status.HTTP_201_CREATED)
def create_link(
    data: ShareLinkCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file, folder = ss.get_owned_target(db, user, data)
    _check_future(data.expires_at)
    link = ShareLink(
        token=ss.new_token(),
        file_id=data.file_id,
        folder_id=data.folder_id,
        created_by=user.id,
        password_hash=hash_password(data.password) if data.password else None,
        expires_at=data.expires_at,
    )
    db.add(link)
    db.flush()
    item = file or folder
    log_activity(db, user, "share.link_create", "file" if file else "folder", item.id, item.name,
                 details="password protected" if data.password else None, request=request)
    db.commit()
    return link


def _get_own_link(db: Session, user: User, link_id: int) -> ShareLink:
    link = db.get(ShareLink, link_id)
    if link is None or link.created_by != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link not found")
    return link


@router.patch("/links/{link_id}", response_model=ShareLinkOut)
def update_link(
    link_id: int,
    data: ShareLinkUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Change a link's password and/or expiry (only the fields that are sent)."""
    link = _get_own_link(db, user, link_id)
    if "password" in data.model_fields_set:
        link.password_hash = hash_password(data.password) if data.password else None
    if "expires_at" in data.model_fields_set:
        _check_future(data.expires_at)
        link.expires_at = data.expires_at
    db.commit()
    return link


@router.delete("/links/{link_id}", response_model=MessageResponse)
def delete_link(
    link_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a link: anyone using it will get "link not found" from now on."""
    link = _get_own_link(db, user, link_id)
    item = link.file or link.folder
    log_activity(db, user, "share.link_delete", "file" if link.file_id else "folder",
                 item.id, item.name, request=request)
    db.delete(link)
    db.commit()
    return MessageResponse(message="Link deleted")


# ---------------------------------------------------------------------------
# Sharing with specific users
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserShareOut])
def list_user_shares(
    target: ShareTarget = Depends(_target_from_query),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Everyone a file or folder is shared with (for the share dialog)."""
    ss.get_owned_target(db, user, target)
    return db.scalars(
        select(UserShare).where(ss.target_filter(UserShare, target)).order_by(UserShare.created_at)
    ).all()


@router.post("/users", response_model=UserShareOut, status_code=status.HTTP_201_CREATED)
def share_with_user(
    data: UserShareCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Share with a registered user by email. Sharing again just updates the permission."""
    file, folder = ss.get_owned_target(db, user, data)
    target_user = db.scalar(select(User).where(User.email == data.email.lower()))
    if target_user is None or not target_user.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No OpenVault user has this email")
    if target_user.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already own this item")

    share = db.scalar(
        select(UserShare).where(ss.target_filter(UserShare, data), UserShare.target_user_id == target_user.id)
    )
    if share is None:
        share = UserShare(
            file_id=data.file_id,
            folder_id=data.folder_id,
            owner_id=user.id,
            target_user_id=target_user.id,
        )
        db.add(share)
    share.permission = data.permission
    db.flush()

    item = file or folder
    log_activity(db, user, "share.user_add", "file" if file else "folder", item.id, item.name,
                 details=f"{target_user.email} ({data.permission})", request=request)
    db.commit()
    db.refresh(share)
    return share


def _get_own_user_share(db: Session, user: User, share_id: int) -> UserShare:
    share = db.get(UserShare, share_id)
    if share is None or share.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    return share


@router.patch("/users/{share_id}", response_model=UserShareOut)
def update_user_share(
    share_id: int,
    data: UserShareUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    share = _get_own_user_share(db, user, share_id)
    share.permission = data.permission
    db.commit()
    return share


@router.delete("/users/{share_id}", response_model=MessageResponse)
def remove_user_share(
    share_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stop sharing with that user."""
    share = _get_own_user_share(db, user, share_id)
    item = share.file or share.folder
    log_activity(db, user, "share.user_remove", "file" if share.file_id else "folder",
                 item.id, item.name, details=share.target_user.email, request=request)
    db.delete(share)
    db.commit()
    return MessageResponse(message="Access removed")


@router.get("/with-me", response_model=SharedWithMe)
def shared_with_me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Files and folders other people have shared with you (newest first).
    Items their owner has moved to the Trash are hidden."""
    shares = db.scalars(
        select(UserShare)
        .outerjoin(File, UserShare.file_id == File.id)
        .outerjoin(Folder, UserShare.folder_id == Folder.id)
        .where(
            UserShare.target_user_id == user.id,
            File.deleted_at.is_(None),
            Folder.deleted_at.is_(None),
        )
        .order_by(UserShare.created_at.desc())
    ).all()
    return SharedWithMe(
        items=[
            SharedItemOut(
                share_id=s.id,
                permission=s.permission,
                shared_at=s.created_at,
                owner=s.owner,
                file=s.file,
                folder=s.folder,
            )
            for s in shares
        ]
    )
