"""
Background scheduler for automatic backups (APScheduler).

APScheduler's BackgroundScheduler runs in its own thread inside the API
process. Each enabled BackupJob becomes one scheduler entry with the id
"backup-<job id>" and a cron trigger (e.g. every day at 02:00 UTC).

The database is the source of truth: on startup every enabled job is
loaded, and whenever a job is created, changed or deleted through the API
`sync_job` / `remove_job` update the scheduler to match.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import BackupJob
from app.services.backup_service import build_trigger, recover_interrupted_runs, run_scheduled_backup

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(timezone="UTC")


def _scheduler_id(job_id: int) -> str:
    return f"backup-{job_id}"


def sync_job(job: BackupJob) -> None:
    """Add, update or remove the scheduler entry for `job`."""
    if not scheduler.running:  # e.g. in tests, where ENABLE_SCHEDULER=false
        return
    if not job.enabled:
        remove_job(job.id)
        return
    scheduler.add_job(
        run_scheduled_backup,
        trigger=build_trigger(job),
        args=[job.id],
        id=_scheduler_id(job.id),
        replace_existing=True,  # updating a job = replacing its entry
        coalesce=True,  # if several runs were missed, run only once
        max_instances=1,  # never run the same job twice at the same time
        misfire_grace_time=3600,  # still run if the server was busy/down for < 1 hour
    )


def remove_job(job_id: int) -> None:
    if scheduler.running and scheduler.get_job(_scheduler_id(job_id)):
        scheduler.remove_job(_scheduler_id(job_id))


def start_scheduler() -> None:
    """Called once at server startup."""
    recover_interrupted_runs()
    if not get_settings().enable_scheduler:
        logger.info("Backup scheduler disabled (ENABLE_SCHEDULER=false)")
        return
    scheduler.start()
    with SessionLocal() as db:
        for job in db.scalars(select(BackupJob).where(BackupJob.enabled.is_(True))):
            sync_job(job)
    logger.info("Backup scheduler started with %d job(s)", len(scheduler.get_jobs()))


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
