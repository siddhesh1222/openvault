"""Routes for backup schedules, their runs, restore and download: /api/backups/..."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import scheduler
from app.config import get_settings
from app.database import get_db
from app.models import BackupJob, BackupRun, User
from app.routers.files import content_disposition
from app.schemas import (
    BackupJobCreate,
    BackupJobOut,
    BackupJobUpdate,
    BackupRunOut,
    FileLinks,
    FolderOut,
    MessageResponse,
)
from app.security import create_token, decode_token, get_current_user
from app.services import backup_service as bs
from app.services import file_service as fs
from app.services.activity import log_activity
from app.storage import get_storage

router = APIRouter(prefix="/api/backups", tags=["backups"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def job_out(job: BackupJob) -> BackupJobOut:
    latest = job.runs[0] if job.runs else None  # runs are ordered newest first
    return BackupJobOut(
        id=job.id,
        name=job.name,
        folder_id=job.folder_id,
        folder_name=job.folder.name if job.folder else "My Files",
        frequency=job.frequency,
        hour=job.hour,
        minute=job.minute,
        weekday=job.weekday,
        retention=job.retention,
        enabled=job.enabled,
        created_at=job.created_at,
        last_run_at=job.last_run_at,
        next_run_at=bs.next_run_at(job),
        last_status=latest.status if latest else None,
    )


def run_out(run: BackupRun) -> BackupRunOut:
    return BackupRunOut(
        id=run.id,
        job_id=run.job_id,
        job_name=run.job.name,
        status=run.status,
        trigger=run.trigger,
        started_at=run.started_at,
        finished_at=run.finished_at,
        file_count=run.file_count,
        size=run.size,
        error=run.error,
    )


def get_own_job(db: Session, user: User, job_id: int) -> BackupJob:
    job = db.get(BackupJob, job_id)
    if job is None or job.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup schedule not found")
    return job


def get_own_run(db: Session, user: User, run_id: int) -> BackupRun:
    run = db.get(BackupRun, run_id)
    if run is None or run.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found")
    return run


# ---------------------------------------------------------------------------
# Schedules (jobs)
# ---------------------------------------------------------------------------


@router.get("/jobs", response_model=list[BackupJobOut])
def list_jobs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    jobs = db.scalars(select(BackupJob).where(BackupJob.owner_id == user.id).order_by(BackupJob.created_at))
    return [job_out(job) for job in jobs]


@router.post("/jobs", response_model=BackupJobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    data: BackupJobCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if data.folder_id is not None:
        fs.get_folder(db, user, data.folder_id)  # only your own folders can be backed up
    job = BackupJob(owner_id=user.id, **data.model_dump())
    job.name = job.name.strip()
    db.add(job)
    db.flush()
    log_activity(db, user, "backup.job_create", "backup", job.id, job.name, request=request)
    db.commit()
    scheduler.sync_job(job)
    return job_out(job)


@router.patch("/jobs/{job_id}", response_model=BackupJobOut)
def update_job(
    job_id: int,
    data: BackupJobUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Change a schedule (e.g. pause it with {"enabled": false})."""
    job = get_own_job(db, user, job_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    if job.frequency == "weekly" and job.weekday is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Weekly backups need a weekday")
    db.commit()
    scheduler.sync_job(job)
    return job_out(job)


@router.delete("/jobs/{job_id}", response_model=MessageResponse)
def delete_job(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a schedule AND all of its stored backups."""
    job = get_own_job(db, user, job_id)
    for run in list(job.runs):
        bs.delete_run(db, run)
    log_activity(db, user, "backup.job_delete", "backup", job.id, job.name, request=request)
    db.delete(job)
    db.commit()
    scheduler.remove_job(job_id)
    return MessageResponse(message="Backup schedule deleted")


@router.post("/jobs/{job_id}/run", response_model=BackupRunOut, status_code=status.HTTP_202_ACCEPTED)
def run_now(
    job_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Start a backup immediately. Returns at once with status "running";
    the work continues in the background (poll GET /runs to see the result)."""
    job = get_own_job(db, user, job_id)
    run = bs.start_run(db, job, trigger="manual")
    db.commit()
    background.add_task(bs.execute_run, run.id)  # runs after the response is sent
    return run_out(run)


# ---------------------------------------------------------------------------
# Runs (the backups themselves)
# ---------------------------------------------------------------------------


@router.get("/runs", response_model=list[BackupRunOut])
def list_runs(
    job_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Backup history (newest first), for the timeline on the Backups page."""
    query = select(BackupRun).where(BackupRun.owner_id == user.id)
    if job_id is not None:
        query = query.where(BackupRun.job_id == job_id)
    runs = db.scalars(query.order_by(BackupRun.started_at.desc(), BackupRun.id.desc()).limit(100))
    return [run_out(run) for run in runs]


@router.post("/runs/{run_id}/restore", response_model=FolderOut)
def restore_run(
    run_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Restore a backup into a new "Restored – ..." folder. Existing files are not touched."""
    run = get_own_run(db, user, run_id)
    folder = bs.restore_run(db, run, user)
    log_activity(db, user, "backup.restore", "backup", run.job_id, run.job.name,
                 details=f'into "{folder.name}"', request=request)
    db.commit()
    return folder


@router.delete("/runs/{run_id}", response_model=MessageResponse)
def delete_run(run_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    run = get_own_run(db, user, run_id)
    if run.status == "running":
        raise HTTPException(status.HTTP_409_CONFLICT, "Wait for the backup to finish first")
    bs.delete_run(db, run)
    db.commit()
    return MessageResponse(message="Backup deleted")


@router.post("/runs/{run_id}/links", response_model=FileLinks)
def backup_links(run_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """A short-lived link to download the backup as a .zip file."""
    run = get_own_run(db, user, run_id)
    if run.status != "success":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only successful backups can be downloaded")
    minutes = get_settings().file_link_expire_minutes
    url = f"/api/backups/runs/{run.id}/content?token={create_token(str(run.id), 'backup', minutes)}"
    return FileLinks(
        preview_url=url,
        download_url=url,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes),
    )


@router.get("/runs/{run_id}/content")
def backup_content(run_id: int, token: str, db: Session = Depends(get_db)):
    payload = decode_token(token, expected_type="backup")
    run = db.get(BackupRun, run_id)
    if payload["sub"] != str(run_id) or run is None or run.storage_key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found")
    filename = f"{run.job.name} {run.started_at:%Y-%m-%d %H%M}.zip"
    return StreamingResponse(
        get_storage().get(run.storage_key),
        media_type="application/zip",
        headers={
            "Content-Length": str(run.size),
            "Content-Disposition": content_disposition("attachment", filename),
        },
    )
