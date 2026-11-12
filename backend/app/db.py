import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from .config import settings, ROOT


def connect():
    Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(settings.database_path, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 20000")
    return db


@contextmanager
def database():
    db = connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize():
    from .catalog import seed_catalog

    with database() as db:
        db.executescript((ROOT / "database/schema.sql").read_text())
        seed_catalog(db)


def track_dict(row):
    item = dict(row)
    for field in ("genres", "moods"):
        item[field] = (
            json.loads(item[field]) if isinstance(item[field], str) else item[field]
        )
    return item
