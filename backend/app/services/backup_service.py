"""
Backups: snapshot a folder (or all of My Files) into an encrypted zip.

What happens in one backup run:
1. A BackupRun row is created with status "running" (the UI shows a spinner).
2. Every file in the folder tree is decrypted and written into a temporary
   zip, under "files/<path>". A "manifest.json" lists each file with its
   size and SHA-256 checksum.
3. The zip itself is encrypted and stored like any other blob.
4. The run is marked "success" (or "failed" with the error message), and
   old backups beyond the job's retention count are deleted.

Restoring never overwrites anything: the backup is unpacked into a NEW
top-level folder called "Restored – <job> – <date>", and every file is
checked against the checksum in the manifest.
"""

import json
import logging
import os
import tempfile
import zipfile
from datetime import datetime, timezone

from apscheduler.triggers.cron import CronTrigger
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import BackupJob, BackupRun, File, Folder, User, utcnow
from app.services import file_service as fs
from app.services.activity import log_activity
from app.services.quota import ensure_quota
from app.storage import get_storage

logger = logging.getLogger(__name__)

MANIFEST = "manifest.json"
FILES_PREFIX = "files/"  # user files live under this folder inside the zip
MAX_FAILED_RUNS_KEPT = 10  # failed runs kept for troubleshooting


class BackupError(Exception):
    """A problem that should be shown to the user as the reason a backup failed."""


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------


def build_trigger(job: BackupJob) -> CronTrigger:
    """APScheduler trigger for a job, e.g. "every day at 02:00 UTC"
    or "every Monday at 02:00 UTC" (weekday 0 = Monday)."""
    return CronTrigger(
        hour=job.hour,
        minute=job.minute,
        day_of_week=job.weekday if job.frequency == "weekly" else None,
        timezone="UTC",
    )


def next_run_at(job: BackupJob) -> datetime | None:
    """When the job will run next (naive UTC), or None if it is paused."""
    if not job.enabled:
        return None
    upcoming = build_trigger(job).get_next_fire_time(None, datetime.now(timezone.utc))
    return upcoming.astimezone(timezone.utc).replace(tzinfo=None) if upcoming else None


# ---------------------------------------------------------------------------
# Running a backup
# ---------------------------------------------------------------------------


def start_run(db: Session, job: BackupJob, trigger: str) -> BackupRun:
    """Create a "running" BackupRun row. The actual work is done by execute_run()."""
    already_running = db.scalar(
        select(BackupRun.id).where(BackupRun.job_id == job.id, BackupRun.status == "running")
    )
    if already_running:
        raise HTTPException(status.HTTP_409_CONFLICT, "This backup is already running")
    run = BackupRun(job_id=job.id, owner_id=job.owner_id, status="running", trigger=trigger)
    db.add(run)
    db.flush()
    return run


def _collect(db: Session, job: BackupJob) -> tuple[list[tuple[str, File]], list[str]]:
    """Walk the folder tree. Returns ([(path, file), ...], [folder path, ...])."""
    if job.folder_id is not None:
        folder = db.get(Folder, job.folder_id)
        if folder is None or folder.deleted_at is not None:
            raise BackupError("The folder of this backup is in the Trash")

    files, folders = [], []
    pending = [(job.folder_id, "")]  # (folder id, path prefix) still to visit
    while pending:
        folder_id, prefix = pending.pop()
        sub_folders, folder_files = fs.list_folder(db, job.owner_id, folder_id)
        files.extend((prefix + f.name, f) for f in folder_files)
        for sub in sub_folders:
            path = f"{prefix}{sub.name}/"
            folders.append(path)
            pending.append((sub.id, path))
    return files, folders


def build_archive(db: Session, job: BackupJob, out) -> int:
    """Write the zip for `job` into the open file `out`. Returns the file count."""
    files, folders = _collect(db, job)
    storage = get_storage()
    manifest = {
        "app": "OpenVault",
        "job": job.name,
        "created_at": utcnow().isoformat() + "Z",
        "files": [],
    }
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in folders:  # so empty folders are restored too
            zf.mkdir(FILES_PREFIX + path)
        for path, file in files:
            version = file.current_version
            with zf.open(FILES_PREFIX + path, "w", force_zip64=True) as entry:
                for chunk in storage.get(version.storage_key):  # decrypt chunk by chunk
                    entry.write(chunk)
            manifest["files"].append({"path": path, "size": version.size, "sha256": version.sha256})
        zf.writestr(MANIFEST, json.dumps(manifest, indent=2))
    return len(files)


def _error_message(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    if isinstance(exc, BackupError):
        return str(exc)
    return f"Unexpected error: {exc.__class__.__name__}"


def execute_run(run_id: int) -> None:
    """Do the work for a "running" BackupRun.

    Called from a background task or the scheduler thread, i.e. outside any
    request, so it opens its own database session.
    """
    with SessionLocal() as db:
        run = db.get(BackupRun, run_id)
        job = run.job
        owner = db.get(User, job.owner_id)
        try:
            with tempfile.TemporaryFile() as archive:
                run.file_count = build_archive(db, job, archive)
                archive.seek(0, os.SEEK_END)
                ensure_quota(db, owner, archive.tell())  # backups count towards the quota
                archive.seek(0)
                blob = get_storage().put(archive)  # encrypt + store the zip
            run.storage_key, run.size, run.status = blob.key, blob.size, "success"
        except Exception as exc:  # any failure is recorded on the run, never crashes the server
            logger.exception("Backup run %s failed", run_id)
            db.rollback()  # undo half-done changes; `run` is reloaded on next access
            run.status, run.error = "failed", _error_message(exc)

        run.finished_at = utcnow()
        job.last_run_at = run.started_at
        log_activity(db, owner, f"backup.{run.status}", "backup", job.id, job.name,
                     details=f"{run.file_count} file(s)" if run.status == "success" else run.error)
        apply_retention(db, job)
        db.commit()


def apply_retention(db: Session, job: BackupJob) -> None:
    """Keep the newest `job.retention` successful backups (and a few failed
    runs for troubleshooting); delete the rest."""
    db.flush()  # make sure the run we just finished is visible to the query
    finished = db.scalars(
        select(BackupRun)
        .where(BackupRun.job_id == job.id, BackupRun.status != "running")
        .order_by(BackupRun.started_at.desc(), BackupRun.id.desc())
    ).all()
    successes = [r for r in finished if r.status == "success"]
    failures = [r for r in finished if r.status == "failed"]
    for old in successes[job.retention:] + failures[MAX_FAILED_RUNS_KEPT:]:
        delete_run(db, old)


def delete_run(db: Session, run: BackupRun) -> None:
    if run.storage_key:
        fs.delete_blob_after_commit(db, run.storage_key)
    db.delete(run)


def run_scheduled_backup(job_id: int) -> None:
    """Entry point used by APScheduler when a job's time comes."""
    with SessionLocal() as db:
        job = db.get(BackupJob, job_id)
        if job is None or not job.enabled:
            return
        try:
            run = start_run(db, job, trigger="scheduled")
        except HTTPException:  # previous run still busy: skip this time
            logger.warning("Skipping backup job %s: previous run still running", job_id)
            return
        db.commit()
    execute_run(run.id)


def recover_interrupted_runs() -> None:
    """At startup: runs still marked "running" were cut off by a server stop."""
    with SessionLocal() as db:
        for run in db.scalars(select(BackupRun).where(BackupRun.status == "running")):
            run.status = "failed"
            run.error = "Interrupted because the server stopped"
            run.finished_at = utcnow()
        db.commit()


# ---------------------------------------------------------------------------
# Restoring
# ---------------------------------------------------------------------------


def restore_run(db: Session, run: BackupRun, user: User) -> Folder:
    """Unpack a successful backup into a new top-level folder and return it."""
    if run.status != "success" or not run.storage_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only successful backups can be restored")

    storage = get_storage()
    new_keys: list[str] = []  # blobs created so far, removed again if anything fails
    try:
        with tempfile.TemporaryFile() as archive:
            for chunk in storage.get(run.storage_key):  # zip files need random access,
                archive.write(chunk)  # so decrypt into a temporary file first
            archive.seek(0)
            with zipfile.ZipFile(archive) as zf:
                manifest = json.loads(zf.read(MANIFEST))
                ensure_quota(db, user, sum(item["size"] for item in manifest["files"]))

                stamp = run.started_at.strftime("%d %b %Y %H.%M")
                root = Folder(
                    owner_id=user.id,
                    name=fs.unique_name(db, user.id, None, f"Restored – {run.job.name} – {stamp}"),
                )
                db.add(root)
                db.flush()
                folder_ids = {"": root.id}  # path inside the backup -> new folder id

                def folder_for(path: str) -> int:
                    """Id of the restored folder for "a/b/c", creating it (and parents) if needed."""
                    if path not in folder_ids:
                        parent_path, _, name = path.rpartition("/")
                        folder = Folder(owner_id=user.id, parent_id=folder_for(parent_path),
                                        name=fs.clean_name(name))
                        db.add(folder)
                        db.flush()
                        folder_ids[path] = folder.id
                    return folder_ids[path]

                for entry in zf.namelist():
                    if entry.startswith(FILES_PREFIX) and entry.endswith("/"):
                        folder_for(entry[len(FILES_PREFIX):].rstrip("/"))

                for item in manifest["files"]:
                    parent_path, _, name = item["path"].rpartition("/")
                    with zf.open(FILES_PREFIX + item["path"]) as source:
                        blob = storage.put(source)  # re-encrypt as a new, independent blob
                    new_keys.append(blob.key)
                    if blob.sha256 != item["sha256"]:
                        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                            f'Backup is damaged: checksum mismatch for "{item["path"]}"')
                    file = File(owner_id=user.id, folder_id=folder_for(parent_path),
                                name=fs.clean_name(name), mime_type=fs.guess_mime_type(name))
                    db.add(file)
                    fs.add_version(db, file, blob, user)
        db.flush()
        return root
    except Exception:
        for key in new_keys:
            storage.delete(key)
        raise
