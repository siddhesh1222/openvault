"""
OpenVault API entry point.

Run in development with:
    uvicorn app.main:app --reload
Interactive API docs are then available at http://localhost:8000/docs
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (imported so every table is registered on Base)
from app.config import get_settings
from app.database import Base, engine
from app.routers import auth, files, folders, public, shares, trash, users

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Code that runs once when the server starts (before `yield`) and stops (after)."""
    Path(settings.storage_dir).mkdir(parents=True, exist_ok=True)
    # Create any missing tables. (A bigger project would use Alembic migrations.)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="OpenVault API",
    description="Self-hostable, open source file sharing and backup.",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow the React dev server (a different origin) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(folders.router)
app.include_router(files.router)
app.include_router(trash.router)
app.include_router(shares.router)
app.include_router(public.router)


@app.get("/api/health", tags=["meta"])
def health():
    """Simple check used by Docker and monitoring to see if the API is up."""
    return {"status": "ok", "app": settings.app_name}
