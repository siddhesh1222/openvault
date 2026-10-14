"""Routes for the Trash page: /api/trash"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import ItemList, MessageResponse
from app.security import get_current_user
from app.services import file_service as fs
from app.services.activity import log_activity

router = APIRouter(prefix="/api/trash", tags=["trash"])


@router.get("", response_model=ItemList)
def list_trash(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Items in the Trash, newest first."""
    folders, files = fs.list_trash(db, user)
    return ItemList(folders=folders, files=files)


@router.delete("", response_model=MessageResponse)
def empty_trash(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Permanently delete everything in the Trash."""
    folders, files = fs.list_trash(db, user)
    # Files first: a trashed folder's own files are removed with the folder.
    for file in files:
        fs.delete_file_forever(db, file)
    for folder in folders:
        fs.delete_folder_forever(db, folder)
    count = len(folders) + len(files)
    log_activity(db, user, "trash.empty", details=f"{count} item(s)", request=request)
    db.commit()
    return MessageResponse(message=f"Deleted {count} item(s) forever")
