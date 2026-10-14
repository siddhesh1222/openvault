"""
Public share pages, used by visitors who are NOT logged in: /api/public/s/<token>/...

Flow for a visitor opening https://<server>/s/<token>:
1. GET  /api/public/s/<token>                -> what is shared (or "password required")
2. POST /api/public/s/<token>/unlock         -> only if it has a password; returns `access`
3. GET  /api/public/s/<token>/files/<id>/content?access=...  -> preview / download
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import FolderContents, PublicShare, ShareUnlock, ShareUnlockResponse
from app.services import file_service as fs
from app.services import share_service as ss
from app.services.activity import log_activity
from app.routers.files import stream_file

router = APIRouter(prefix="/api/public/s", tags=["public"])


@router.get("/{token}", response_model=PublicShare)
def open_share(
    token: str,
    folder_id: int | None = None,
    access: str | None = None,
    db: Session = Depends(get_db),
):
    """Describe a shared link. For folder links, `folder_id` browses sub-folders."""
    link = ss.find_active_link(db, token)
    info = PublicShare(
        type="file" if link.file_id else "folder",
        owner_name=(link.file or link.folder).owner.name,
        requires_password=not ss.is_unlocked(link, access),
    )
    if info.requires_password:
        return info  # reveal nothing else until the password is given

    info.expires_at = link.expires_at
    if link.file is not None:
        info.name = link.file.name
        info.file = link.file
    else:
        info.name = link.folder.name
        folder = ss.public_folder(db, link, folder_id)
        folders, files = fs.list_folder(db, folder.owner_id, folder.id)
        info.contents = FolderContents(
            folder=folder,
            breadcrumbs=fs.breadcrumbs(db, folder, start_at_id=link.folder_id),
            permission="view",
            folders=folders,
            files=files,
        )
    return info


@router.post("/{token}/unlock", response_model=ShareUnlockResponse)
def unlock_share(token: str, data: ShareUnlock, db: Session = Depends(get_db)):
    """Exchange the link password for a short-lived access token."""
    link = ss.find_active_link(db, token)
    return ShareUnlockResponse(access=ss.unlock(link, data.password))


@router.get("/{token}/files/{file_id}/content")
def shared_file_content(
    token: str,
    file_id: int,
    request: Request,
    access: str | None = None,
    download: bool = False,
    db: Session = Depends(get_db),
):
    """Preview or download a file through a public link."""
    link = ss.find_active_link(db, token)
    ss.require_unlocked(link, access)
    file = ss.public_file(db, link, file_id)

    if download:
        link.download_count += 1
        owner = (link.file or link.folder).owner
        log_activity(db, owner, "share.download", "file", file.id, file.name,
                     details="via public link", request=request)
        db.commit()
    return stream_file(file, file.current_version, download)
