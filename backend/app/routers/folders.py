"""Routes for browsing, creating, renaming, moving and deleting folders: /api/folders/..."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Folder, User
from app.schemas import FolderContents, FolderCreate, FolderOut, FolderUpdate, MessageResponse
from app.security import get_current_user
from app.services import access, share_service
from app.services import file_service as fs
from app.services.activity import log_activity

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("/contents", response_model=FolderContents)
def folder_contents(
    folder_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List one folder. Leave out `folder_id` for the top level ("My Files").
    Works for your own folders and for folders shared with you."""
    if folder_id is None:
        folder, owner_id, permission, start_at = None, user.id, "owner", None
    else:
        folder = fs.get_folder(db, user, folder_id, need="view")
        owner_id = folder.owner_id
        permission = access.folder_permission(db, user, folder)
        # Guests only see the path from the folder that was shared with them.
        start_at = None if permission == "owner" else access.shared_root_id(db, user, folder)

    folders, files = fs.list_folder(db, owner_id, folder_id)
    contents = FolderContents(
        folder=folder,
        breadcrumbs=fs.breadcrumbs(db, folder, start_at_id=start_at),
        permission=permission,
        folders=folders,
        files=files,
    )
    if permission == "owner":  # mark items the owner has shared (badge in the UI)
        shared_files, shared_folders = share_service.shared_ids(db, user.id)
        for item in contents.folders:
            item.shared = item.id in shared_folders
        for item in contents.files:
            item.shared = item.id in shared_files
    return contents


@router.post("", response_model=FolderOut, status_code=status.HTTP_201_CREATED)
def create_folder(
    data: FolderCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = fs.clean_name(data.name)
    owner_id = user.id
    if data.parent_id is not None:
        # Creating inside a shared folder needs "edit"; the new folder belongs
        # to the owner of the parent folder.
        owner_id = fs.get_folder(db, user, data.parent_id, need="edit").owner_id
    fs.ensure_name_free(db, owner_id, data.parent_id, name)

    folder = Folder(owner_id=owner_id, parent_id=data.parent_id, name=name)
    db.add(folder)
    db.flush()
    log_activity(db, user, "folder.create", "folder", folder.id, folder.name, request=request)
    db.commit()
    return folder


@router.patch("/{folder_id}", response_model=FolderOut)
def update_folder(
    folder_id: int,
    data: FolderUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Rename (needs edit permission) and/or move (owner only) a folder."""
    folder = fs.get_folder(db, user, folder_id, need="edit")
    new_name = fs.clean_name(data.name) if data.name is not None else folder.name
    new_parent = folder.parent_id

    # `model_fields_set` tells "parent_id was sent as null" (move to top level)
    # apart from "parent_id was not sent at all" (don't move).
    if "parent_id" in data.model_fields_set and data.parent_id != folder.parent_id:
        if folder.owner_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can move this folder")
        new_parent = data.parent_id
        if new_parent is not None:
            fs.get_folder(db, user, new_parent)
            if fs.is_inside(db, new_parent, folder.id):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "A folder cannot be moved into itself")

    fs.ensure_name_free(db, folder.owner_id, new_parent, new_name, skip_folder_id=folder.id)

    if new_name != folder.name:
        log_activity(db, user, "folder.rename", "folder", folder.id, new_name,
                     details=f"from {folder.name}", request=request)
    if new_parent != folder.parent_id:
        log_activity(db, user, "folder.move", "folder", folder.id, new_name, request=request)
    folder.name, folder.parent_id = new_name, new_parent
    db.commit()
    return folder


@router.delete("/{folder_id}", response_model=MessageResponse)
def trash_folder(
    folder_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Move a folder (and everything inside it) to the Trash."""
    folder = fs.get_folder(db, user, folder_id)
    fs.trash_folder(db, folder)
    log_activity(db, user, "folder.trash", "folder", folder.id, folder.name, request=request)
    db.commit()
    return MessageResponse(message=f'"{folder.name}" moved to Trash')


@router.post("/{folder_id}/restore", response_model=FolderOut)
def restore_folder(
    folder_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    folder = fs.get_folder(db, user, folder_id, in_trash=True)
    fs.restore_folder(db, folder)
    log_activity(db, user, "folder.restore", "folder", folder.id, folder.name, request=request)
    db.commit()
    return folder


@router.delete("/{folder_id}/permanent", response_model=MessageResponse)
def delete_folder_forever(
    folder_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Permanently delete a folder that is in the Trash. Cannot be undone."""
    folder = fs.get_folder(db, user, folder_id, in_trash=True)
    name = folder.name
    fs.delete_folder_forever(db, folder)
    log_activity(db, user, "folder.delete", "folder", folder_id, name, request=request)
    db.commit()
    return MessageResponse(message=f'"{name}" deleted forever')
