"""Tests for the dashboard numbers and the personal activity log."""


def test_dashboard_stats(client, register, upload):
    headers = register("alice@example.com")
    folder = client.post("/api/folders", headers=headers, json={"name": "Docs"}).json()
    upload(headers, "photo.png", b"x" * 100)
    upload(headers, "clip.mp4", b"x" * 300)
    upload(headers, "report.pdf", b"x" * 50, folder_id=folder["id"])
    upload(headers, "notes.txt", b"x" * 25)
    upload(headers, "notes.txt", b"y" * 30)  # new version: counts once in "by kind", twice in uploads
    old = upload(headers, "old.zip", b"z" * 10)
    client.delete(f"/api/files/{old['id']}", headers=headers)  # in Trash

    data = client.get("/api/dashboard", headers=headers).json()
    assert data["file_count"] == 4  # Trash excluded
    assert data["folder_count"] == 1
    assert data["trash_bytes"] == 10
    assert data["used_bytes"] == 100 + 300 + 50 + 25 + 30 + 10  # every stored version counts
    by_kind = {k["kind"]: (k["bytes"], k["count"]) for k in data["by_kind"]}
    assert by_kind == {"image": (100, 1), "video": (300, 1), "document": (50 + 30, 2)}
    assert len(data["uploads_per_day"]) == 14
    assert data["uploads_per_day"][-1]["count"] == 6  # all of today's uploads, incl. versions
    assert data["uploads_per_day"][0]["count"] == 0


def test_shared_counts(client, register, upload):
    alice = register("alice@example.com")
    bob = register("bob@example.com")
    file = upload(alice, "a.txt", b"a")
    client.post("/api/shares/links", headers=alice, json={"file_id": file["id"]})
    client.post("/api/shares/users", headers=alice, json={"file_id": file["id"], "email": "bob@example.com"})
    assert client.get("/api/dashboard", headers=alice).json()["shared_count"] == 2
    assert client.get("/api/dashboard", headers=bob).json()["shared_with_me_count"] == 1


def test_activity_log_paging_and_filter(client, register, upload):
    headers = register("alice@example.com")
    for i in range(5):
        upload(headers, f"f{i}.txt", b"x")
    client.post("/api/folders", headers=headers, json={"name": "Folder"})

    page = client.get("/api/activity", headers=headers, params={"limit": 3}).json()
    assert page["total"] == 7  # register + 5 uploads + folder
    assert [i["action"] for i in page["items"]] == ["folder.create", "file.upload", "file.upload"]
    assert page["items"][0]["created_at"].endswith("Z")

    second = client.get("/api/activity", headers=headers, params={"limit": 3, "offset": 3}).json()
    assert len(second["items"]) == 3

    files_only = client.get("/api/activity", headers=headers, params={"category": "file"}).json()
    assert files_only["total"] == 5


def test_activity_is_private(client, register, upload):
    alice = register("alice@example.com")
    bob = register("bob@example.com")
    upload(alice, "secret.txt", b"x")
    actions = [i["action"] for i in client.get("/api/activity", headers=bob).json()["items"]]
    assert actions == ["user.register"]
