"""Checks that the data model also works on PostgreSQL (without needing a Postgres server)."""

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.database import Base


def test_all_tables_compile_for_postgresql():
    # Turning every table into PostgreSQL "CREATE TABLE" SQL catches types or
    # defaults that only work on SQLite.
    for table in Base.metadata.sorted_tables:
        sql = str(CreateTable(table).compile(dialect=postgresql.dialect()))
        assert sql.startswith("\nCREATE TABLE")


def test_expected_tables_exist():
    assert set(Base.metadata.tables) == {
        "users", "folders", "files", "file_versions", "share_links",
        "user_shares", "backup_jobs", "backup_runs", "activity_logs",
    }


def test_foreign_keys_cascade_on_user_delete():
    # Deleting a user must remove everything they own (see admin delete_user).
    for name in ("folders", "files", "backup_jobs", "backup_runs", "share_links", "activity_logs"):
        table = Base.metadata.tables[name]
        owner_fk = next(fk for fk in table.foreign_keys if fk.column.table.name == "users")
        assert owner_fk.ondelete == "CASCADE", name
