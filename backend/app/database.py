"""
Database connection setup (SQLAlchemy 2.0).

`engine`       - the connection pool to the database
`SessionLocal` - a factory that creates a new database session
`Base`         - parent class of every model in models.py
`get_db`       - FastAPI dependency that gives each request its own session
"""

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()
is_sqlite = settings.database_url.startswith("sqlite")

# SQLite only allows the creating thread to use a connection by default;
# FastAPI handles requests on several threads, so we switch that check off.
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(settings.database_url, connect_args=connect_args)

if is_sqlite:
    # Make sure the folder that will hold the .db file exists.
    db_path = engine.url.database
    if db_path and db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    # SQLite ignores foreign keys (and ON DELETE CASCADE) unless told otherwise.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def get_db():
    """Open a session for one request and always close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
