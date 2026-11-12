"""Consistent, private SQLite backup; never puts a listening archive into Git."""

import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.config import settings  # noqa: E402


def main():
    if len(sys.argv) != 2:
        raise SystemExit(
            "Usage: .venv/bin/python scripts/backup.py /private/path/backup.sqlite3"
        )
    source = Path(settings.database_path).resolve()
    destination = Path(sys.argv[1]).expanduser().resolve()
    if not source.is_file():
        raise SystemExit("The configured database does not exist.")
    if destination == source or destination.exists():
        raise SystemExit(
            "Refusing to overwrite the active database or an existing backup."
        )
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Create without a race and with private permissions before SQLite opens it.
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        with (
            sqlite3.connect(f"file:{source}?mode=ro", uri=True) as src,
            sqlite3.connect(destination) as dst,
        ):
            src.backup(dst)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed.")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    print(f"Private backup created: {destination}")


if __name__ == "__main__":
    main()
