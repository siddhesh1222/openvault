"""Routes for uploading, downloading and managing files: /api/files/..."""

from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile, status
from fastapi import File as FileField
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import File, FileVersion, User, utcnow
from app.schemas import FileLinks, FileOut, FileUpdate, ItemList, MessageResponse, VersionOut
from app.security import create_token, decode_token, get_current_user
from app.services import file_service as fs
from app.services.activity import log_activity
from app.storage import get_storage

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload", response_model=FileOut, status_code=status.HTTP_201_CREATED)
def upload(
    request: Request,
    file: UploadFile = FileField(...),
    folder_id: int | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a file (multipart/form-data). Uploading a name that already
    exists in the folder stores a new version of that file.

    You can upload into your own folders, or into folders shared with you
    with "edit" permission. The file then belongs to (and uses the storage
    quota of) the folder's owner.
    """
    owner = user
    if folder_id is not None:
        owner = fs.get_folder(db, user, folder_id, need="edit").owner
    stored, created = fs.upload_file(
        db,
        owner=owner,
        actor=user,
        folder_id=folder_id,
        filename=file.filename or "untitled",
        source=file.file,
        content_type=file.content_type,
    )
    action = "file.upload" if created else "file.new_version"
    log_activity(db, user, action, "file", stored.id, stored.name,
                 details=f"version {stored.version_count}", request=request)
    db.commit()
    return stored


@router.get("/search", response_model=ItemList)
def search(
    q: str = Query(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search your files and folders by name."""
    folders, files = fs.search(db, user, q)
    return ItemList(folders=folders, files=files)


@router.get("/{file_id}", response_model=FileOut)
def get_file_info(file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return fs.get_file(db, user, file_id, need="view")


@router.patch("/{file_id}", response_model=FileOut)
def update_file(
    file_id: int,
    data: FileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rename (needs edit permission) and/or move (owner only) a file.
    `"folder_id": null` moves it to the top level."""
    file = fs.get_file(db, user, file_id, need="edit")
    new_name = fs.clean_name(data.name) if data.name is not None else file.name
    new_folder = file.folder_id
    if "folder_id" in data.model_fields_set and data.folder_id != file.folder_id:
        if file.owner_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can move this file")
        new_folder = data.folder_id
        if new_folder is not None:
            fs.get_folder(db, user, new_folder)

    fs.ensure_name_free(db, file.owner_id, new_folder, new_name, skip_file_id=file.id)

    if new_name != file.name:
        log_activity(db, user, "file.rename", "file", file.id, new_name,
                     details=f"from {file.name}", request=request)
        file.mime_type = fs.guess_mime_type(new_name, file.mime_type)
    if new_folder != file.folder_id:
        log_activity(db, user, "file.move", "file", file.id, new_name, request=request)
    file.name, file.folder_id = new_name, new_folder
    db.commit()
    return file


@router.delete("/{file_id}", response_model=MessageResponse)
def trash_file(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Move a file to the Trash."""
    file = fs.get_file(db, user, file_id)
    file.deleted_at = utcnow()
    log_activity(db, user, "file.trash", "file", file.id, file.name, request=request)
    db.commit()
    return MessageResponse(message=f'"{file.name}" moved to Trash')


@router.post("/{file_id}/restore", response_model=FileOut)
def restore_file(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    file = fs.get_file(db, user, file_id, in_trash=True)
    fs.restore_file(db, file)
    log_activity(db, user, "file.restore", "file", file.id, file.name, request=request)
    db.commit()
    return file


@router.delete("/{file_id}/permanent", response_model=MessageResponse)
def delete_file_forever(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Permanently delete a file that is in the Trash (all versions). Cannot be undone."""
    file = fs.get_file(db, user, file_id, in_trash=True)
    name = file.name
    fs.delete_file_forever(db, file)
    log_activity(db, user, "file.delete", "file", file_id, name, request=request)
    db.commit()
    return MessageResponse(message=f'"{name}" deleted forever')


# ---------------------------------------------------------------------------
# Version history
# ---------------------------------------------------------------------------


def _get_version(file: File, version_id: int) -> FileVersion:
    version = next((v for v in file.versions if v.id == version_id), None)
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    return version


@router.get("/{file_id}/versions", response_model=list[VersionOut])
def list_versions(file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """All stored versions of a file, newest first."""
    file = fs.get_file(db, user, file_id, need="view")
    author_ids = {v.created_by for v in file.versions if v.created_by}
    names = dict(db.execute(select(User.id, User.name).where(User.id.in_(author_ids))).all())
    current = file.current_version
    return [
        VersionOut(
            id=v.id,
            version_no=v.version_no,
            size=v.size,
            sha256=v.sha256,
            created_at=v.created_at,
            created_by_name=names.get(v.created_by),
            is_current=v.id == current.id,
        )
        for v in reversed(file.versions)
    ]


@router.post("/{file_id}/versions", response_model=FileOut, status_code=status.HTTP_201_CREATED)
def upload_version(
    file_id: int,
    request: Request,
    file: UploadFile = FileField(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload new contents for an existing file (the file keeps its name)."""
    target = fs.get_file(db, user, file_id, need="edit")
    version = fs.upload_new_version(db, target, user, file.file)
    log_activity(db, user, "file.new_version", "file", target.id, target.name,
                 details=f"version {version.version_no}", request=request)
    db.commit()
    return target


@router.post("/{file_id}/versions/{version_id}/links", response_model=FileLinks)
def version_links(
    file_id: int, version_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Preview/download links for one specific (possibly old) version."""
    file = fs.get_file(db, user, file_id, need="view")
    return make_file_links(file, user, version_id=_get_version(file, version_id).id)


@router.post("/{file_id}/versions/{version_id}/restore", response_model=FileOut)
def restore_version(
    file_id: int,
    version_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Make an old version current again (it is copied as a new version)."""
    file = fs.get_file(db, user, file_id, need="edit")
    old = _get_version(file, version_id)
    if old.id == file.current_version.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This is already the current version")
    new = fs.restore_version(db, file, old, user)
    log_activity(db, user, "file.version_restore", "file", file.id, file.name,
                 details=f"version {old.version_no} restored as version {new.version_no}", request=request)
    db.commit()
    return file


# ---------------------------------------------------------------------------
# Download / preview
# ---------------------------------------------------------------------------
# <img src>, <video src> and normal browser downloads cannot send our
# "Authorization: Bearer" header. So the frontend first asks for short-lived
# links (POST /links, which IS authenticated) and then uses those URLs.
# Each link carries a JWT that only works for this one file, for 5 minutes.


def make_file_links(file: File, user: User, version_id: int | None = None) -> FileLinks:
    minutes = get_settings().file_link_expire_minutes
    token = create_token(str(file.id), "file", minutes, uid=user.id, ver=version_id)
    base = f"/api/files/{file.id}/content?token={token}"
    return FileLinks(
        preview_url=base,
        download_url=f"{base}&download=1",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes),
    )


@router.post("/{file_id}/links", response_model=FileLinks)
def file_links(file_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    file = fs.get_file(db, user, file_id, need="view")
    return make_file_links(file, user)


# Types the browser may display directly. Anything else (e.g. HTML or SVG,
# which could run JavaScript on our domain) is only offered as a download.
_INLINE_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif",
    "application/pdf",
}
_TEXT_TYPES = {"application/json", "application/xml", "application/javascript", "application/x-yaml"}


def _response_type(mime_type: str) -> tuple[str, bool]:
    """Return (Content-Type to send, can_show_inline)."""
    if mime_type in _INLINE_TYPES or mime_type.startswith(("video/", "audio/")):
        return mime_type, True
    if mime_type.startswith("text/") or mime_type in _TEXT_TYPES:
        # Show all text as plain text, so HTML is displayed rather than executed.
        return "text/plain; charset=utf-8", True
    return "application/octet-stream", False


def content_disposition(kind: str, filename: str) -> str:
    """Header that tells the browser the file name (works with non-English names too)."""
    ascii_name = filename.encode("ascii", "replace").decode().replace('"', "")
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


def stream_file(file: File, version: FileVersion, download: bool) -> StreamingResponse:
    """Decrypt a stored version on the fly and stream it to the browser."""
    media_type, inline_ok = _response_type(file.mime_type)
    kind = "inline" if inline_ok and not download else "attachment"
    return StreamingResponse(
        get_storage().get(version.storage_key),
        media_type=media_type,
        headers={
            "Content-Length": str(version.size),
            "Content-Disposition": content_disposition(kind, file.name),
            "X-Content-Type-Options": "nosniff",  # browser must trust our Content-Type
            "Cache-Control": "private, max-age=300",
        },
    )


@router.get("/{file_id}/content")
def file_content(
    file_id: int,
    request: Request,
    token: str,
    download: bool = False,
    db: Session = Depends(get_db),
):
    """Stream a file using a short-lived link token (see POST /links)."""
    payload = decode_token(token, expected_type="file")
    if payload["sub"] != str(file_id):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Link is not valid for this file")

    file = db.get(File, file_id)
    if file is None or file.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    version = file.current_version
    if payload.get("ver") is not None:  # link to a specific older version
        version = next((v for v in file.versions if v.id == payload["ver"]), None)
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")

    if download:
        user = db.get(User, payload.get("uid"))
        log_activity(db, user, "file.download", "file", file.id, file.name, request=request)
        db.commit()
    return stream_file(file, version, download)
