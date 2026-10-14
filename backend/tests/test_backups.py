"""Tests for backup schedules, backup runs, retention and restore."""

import io
import json
import zipfile
from datetime import datetime
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler

from app import scheduler as scheduler_module
from app.config import get_settings
from app.database import SessionLocal
from app.models import BackupJob, BackupRun, FileVersion
from app.services import backup_service


def blob_count() -> int:
    root = Path(get_settings().storage_dir) / "blobs"
    return sum(1 for p in root.rglob("*") if p.is_file())


def create_folder(client, headers, name, parent_id=None):
    return client.post("/api/folders", headers=headers, json={"name": name, "parent_id": parent_id}).json()


def create_job(client, headers, expect=201, **body):
    response = client.post("/api/backups/jobs", headers=headers, json={"name": "Nightly", **body})
    assert response.status_code == expect, response.text
    return response.json()


def run_now(client, headers, job_id):
    """Start a backup. TestClient finishes background tasks before returning,
    so the run is already complete when we look it up."""
    started = client.post(f"/api/backups/jobs/{job_id}/run", headers=headers)
    assert started.status_code == 202, started.text
    assert started.json()["status"] == "running"
    runs = client.get("/api/backups/runs", headers=headers, params={"job_id": job_id}).json()
    return next(r for r in runs if r["id"] == started.json()["id"])


def make_project(client, headers, upload):
    """Folder tree used by several tests:  Project/{readme.md, src/main.py, empty/}"""
    project = create_folder(client, headers, "Project")
    src = create_folder(client, headers, "src", project["id"])
    create_folder(client, headers, "empty", project["id"])
    upload(headers, "readme.md", b"# Hello", folder_id=project["id"])
    upload(headers, "main.py", b"print('hi')", folder_id=src["id"])
    return project


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------


def test_create_jobs_and_next_run(client, register):
    headers = register("alice@example.com")
    daily = create_job(client, headers, hour=3, minute=30)
    assert daily["folder_name"] == "My Files"
    assert daily["next_run_at"].endswith(":30:00Z")

    weekly = create_job(client, headers, frequency="weekly", weekday=0, hour=1)
    next_run = datetime.fromisoformat(weekly["next_run_at"].replace("Z", "+00:00"))
    assert next_run.weekday() == 0 and next_run.hour == 1  # a Monday at 01:00 UTC

    create_job(client, headers, expect=422, frequency="weekly")  # weekday missing
    create_job(client, headers, expect=422, hour=24)


def test_pause_job(client, register):
    headers = register("alice@example.com")
    job = create_job(client, headers)
    paused = client.patch(f"/api/backups/jobs/{job['id']}", headers=headers, json={"enabled": False}).json()
    assert paused["enabled"] is False and paused["next_run_at"] is None


def test_cannot_back_up_someone_elses_folder(client, register):
    alice = register("alice@example.com")
    bob = register("bob@example.com")
    folder = create_folder(client, alice, "Private")
    create_job(client, bob, expect=404, folder_id=folder["id"])
    job = create_job(client, alice, folder_id=folder["id"])
    assert client.post(f"/api/backups/jobs/{job['id']}/run", headers=bob).status_code == 404


def test_scheduler_follows_job_changes(client, register, monkeypatch):
    # Use a fresh, paused scheduler so nothing actually fires during the test.
    test_scheduler = BackgroundScheduler(timezone="UTC")
    test_scheduler.start(paused=True)
    monkeypatch.setattr(scheduler_module, "scheduler", test_scheduler)
    try:
        headers = register("alice@example.com")
        job = create_job(client, headers, hour=4)
        entry = test_scheduler.get_job(f"backup-{job['id']}")
        assert entry is not None and "hour='4'" in str(entry.trigger)

        client.patch(f"/api/backups/jobs/{job['id']}", headers=headers, json={"hour": 5})
        assert "hour='5'" in str(test_scheduler.get_job(f"backup-{job['id']}").trigger)

        client.patch(f"/api/backups/jobs/{job['id']}", headers=headers, json={"enabled": False})
        assert test_scheduler.get_job(f"backup-{job['id']}") is None
    finally:
        test_scheduler.shutdown(wait=False)


# ---------------------------------------------------------------------------
# Running backups
# ---------------------------------------------------------------------------


def test_backup_run_creates_encrypted_zip(client, register, upload):
    headers = register("alice@example.com")
    project = make_project(client, headers, upload)
    upload(headers, "outside.txt", b"not in project")
    job = create_job(client, headers, folder_id=project["id"])
    blobs_before = blob_count()

    run = run_now(client, headers, job["id"])
    assert run["status"] == "success", run["error"]
    assert run["trigger"] == "manual"
    assert run["file_count"] == 2
    assert blob_count() == blobs_before + 1  # the zip, stored encrypted

    # Download the zip and look inside.
    links = client.post(f"/api/backups/runs/{run['id']}/links", headers=headers).json()
    archive = zipfile.ZipFile(io.BytesIO(client.get(links["download_url"]).content))
    names = set(archive.namelist())
    assert {"files/readme.md", "files/src/main.py", "files/empty/", "manifest.json"} <= names
    assert "files/outside.txt" not in names
    assert archive.read("files/src/main.py") == b"print('hi')"
    manifest = json.loads(archive.read("manifest.json"))
    assert {f["path"] for f in manifest["files"]} == {"readme.md", "src/main.py"}

    # Backups count towards the storage quota.
    used = client.get("/api/auth/me", headers=headers).json()["used_bytes"]
    assert used == len(b"# Hello") + len(b"print('hi')") + len(b"not in project") + run["size"]


def test_whole_drive_backup(client, register, upload):
    headers = register("alice@example.com")
    make_project(client, headers, upload)
    upload(headers, "top.txt", b"top")
    run = run_now(client, headers, create_job(client, headers)["id"])
    assert run["status"] == "success" and run["file_count"] == 3


def test_failed_backup_is_recorded(client, register):
    headers = register("alice@example.com")
    folder = create_folder(client, headers, "Gone")
    job = create_job(client, headers, folder_id=folder["id"])
    client.delete(f"/api/folders/{folder['id']}", headers=headers)  # to Trash

    run = run_now(client, headers, job["id"])
    assert run["status"] == "failed"
    assert run["error"] == "The folder of this backup is in the Trash"
    assert client.post(f"/api/backups/runs/{run['id']}/restore", headers=headers).status_code == 400
    assert client.get("/api/backups/jobs", headers=headers).json()[0]["last_status"] == "failed"


def test_retention_deletes_old_backups(client, register, upload):
    headers = register("alice@example.com")
    upload(headers, "a.txt", b"a")
    job = create_job(client, headers, retention=2)
    run_ids = [run_now(client, headers, job["id"])["id"] for _ in range(3)]

    remaining = client.get("/api/backups/runs", headers=headers).json()
    assert [r["id"] for r in remaining] == [run_ids[2], run_ids[1]]  # oldest one removed
    assert blob_count() == 1 + 2  # a.txt + two backup zips


def test_delete_job_removes_its_backups(client, register, upload):
    headers = register("alice@example.com")
    upload(headers, "a.txt", b"a")
    job = create_job(client, headers)
    run_now(client, headers, job["id"])
    assert blob_count() == 2

    assert client.delete(f"/api/backups/jobs/{job['id']}", headers=headers).status_code == 200
    assert blob_count() == 1
    assert client.get("/api/backups/runs", headers=headers).json() == []


def test_interrupted_runs_are_marked_failed(client, register):
    headers = register("alice@example.com")
    job = create_job(client, headers)
    with SessionLocal() as db:
        db.add(BackupRun(job_id=job["id"], owner_id=1, status="running"))
        db.commit()
    backup_service.recover_interrupted_runs()  # what the server does at startup
    run = client.get("/api/backups/runs", headers=headers).json()[0]
    assert run["status"] == "failed" and "Interrupted" in run["error"]


def test_scheduled_entry_point_runs_backup(client, register, upload):
    headers = register("alice@example.com")
    upload(headers, "a.txt", b"a")
    job = create_job(client, headers)
    backup_service.run_scheduled_backup(job["id"])  # what APScheduler calls
    runs = client.get("/api/backups/runs", headers=headers).json()
    assert runs[0]["status"] == "success" and runs[0]["trigger"] == "scheduled"
    with SessionLocal() as db:
        assert db.get(BackupJob, job["id"]).last_run_at is not None


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------


def test_restore_into_new_folder(client, register, upload, download):
    headers = register("alice@example.com")
    project = make_project(client, headers, upload)
    job = create_job(client, headers, name="Project backup", folder_id=project["id"])
    run = run_now(client, headers, job["id"])

    # Change the original after the backup; the restore must not touch it.
    client.delete(f"/api/folders/{project['id']}", headers=headers)

    response = client.post(f"/api/backups/runs/{run['id']}/restore", headers=headers)
    assert response.status_code == 200, response.text
    restored = response.json()
    assert restored["name"].startswith("Restored – Project backup – ")
    assert restored["parent_id"] is None

    top = client.get("/api/folders/contents", headers=headers, params={"folder_id": restored["id"]}).json()
    assert sorted(f["name"] for f in top["folders"]) == ["empty", "src"]
    assert [f["name"] for f in top["files"]] == ["readme.md"]
    assert download(headers, top["files"][0]["id"]) == b"# Hello"

    src = next(f for f in top["folders"] if f["name"] == "src")
    inner = client.get("/api/folders/contents", headers=headers, params={"folder_id": src["id"]}).json()
    assert download(headers, inner["files"][0]["id"]) == b"print('hi')"


def test_damaged_backup_is_rejected_and_cleaned_up(client, register, upload):
    headers = register("alice@example.com")
    upload(headers, "a.txt", b"important")
    with SessionLocal() as db:  # corrupt the recorded checksum, so the manifest is wrong
        db.query(FileVersion).update({"sha256": "0" * 64})
        db.commit()
    run = run_now(client, headers, create_job(client, headers)["id"])
    blobs_before = blob_count()

    response = client.post(f"/api/backups/runs/{run['id']}/restore", headers=headers)
    assert response.status_code == 422 and "checksum mismatch" in response.json()["detail"]
    assert blob_count() == blobs_before  # nothing left behind
    assert len(client.get("/api/folders/contents", headers=headers).json()["folders"]) == 0
