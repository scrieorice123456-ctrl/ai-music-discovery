import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


class Settings:
    database_path = os.getenv("DATABASE_PATH", str(ROOT / "data/music.sqlite3"))
    app_env = os.getenv("APP_ENV", "development")
    cookie_secure = (
        os.getenv(
            "COOKIE_SECURE", "true" if app_env == "production" else "false"
        ).lower()
        == "true"
    )
    session_days = int(os.getenv("SESSION_DAYS", "30"))
    external_apis = os.getenv("EXTERNAL_APIS_ENABLED", "true").lower() == "true"
    musicbrainz_url = os.getenv("MUSICBRAINZ_BASE_URL", "https://musicbrainz.org/ws/2")
    musicbrainz_ua = os.getenv(
        "MUSICBRAINZ_USER_AGENT",
        "AI-Music-Discovery/1.0 (https://github.com/scrieorice123456-ctrl/ai-music-discovery)",
    )
    itunes_url = os.getenv("ITUNES_BASE_URL", "https://itunes.apple.com")
    country = os.getenv("ITUNES_COUNTRY", "ro")
    cache_hours = int(os.getenv("CATALOG_CACHE_HOURS", "24"))
    max_upload = int(os.getenv("MAX_UPLOAD_MB", "30")) * 1024 * 1024
    max_uncompressed = int(os.getenv("MAX_UNCOMPRESSED_MB", "80")) * 1024 * 1024
    max_events = int(os.getenv("MAX_IMPORT_EVENTS", "100000"))


settings = Settings()
