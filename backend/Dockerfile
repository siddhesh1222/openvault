# OpenVault backend (FastAPI) image.
FROM python:3.12-slim

# Don't write .pyc files; print logs straight away (no buffering).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first: this layer is cached until requirements.txt changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Run as an unprivileged user, never as root.
RUN useradd --create-home --uid 1000 openvault \
    && mkdir -p /app/data \
    && chown openvault:openvault /app/data
COPY --chown=openvault:openvault app ./app
USER openvault

# The database (SQLite) and encrypted file blobs live here -> mount a volume.
VOLUME ["/app/data"]
EXPOSE 8000

# Docker marks the container "healthy" once the API answers.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# --proxy-headers: trust X-Forwarded-For from nginx so the activity log
# records the visitor's real IP address, not nginx's.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
