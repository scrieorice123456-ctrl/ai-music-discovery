FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 APP_ENV=production DATABASE_PATH=/app/data/music.sqlite3
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
 && groupadd --gid 10001 music \
 && useradd --uid 10001 --gid music --create-home music \
 && mkdir /app/data && chown music:music /app/data
COPY --chown=music:music backend/app /app/backend/app
COPY --chown=music:music backend/__init__.py /app/backend/__init__.py
COPY --chown=music:music recommendation /app/recommendation
COPY --chown=music:music database /app/database
COPY --from=frontend --chown=music:music /build/dist /app/frontend/dist
USER music
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health', timeout=4)"
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "3000", "--workers", "1"]
