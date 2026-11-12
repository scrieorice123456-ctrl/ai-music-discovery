PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 csrf_token TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 is_demo INTEGER NOT NULL DEFAULT 1,
 settings TEXT NOT NULL DEFAULT '{"similar":50,"discovery":30,"experimental":20}'
);
CREATE TABLE IF NOT EXISTS tracks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 artist TEXT NOT NULL,
 normalized_key TEXT NOT NULL UNIQUE,
 album TEXT NOT NULL DEFAULT '',
 genres TEXT NOT NULL DEFAULT '[]',
 moods TEXT NOT NULL DEFAULT '[]',
 energy REAL NOT NULL DEFAULT 0.5,
 valence REAL NOT NULL DEFAULT 0.5,
 family TEXT NOT NULL DEFAULT '',
 art TEXT NOT NULL DEFAULT '/art/cover-1.svg',
 source TEXT NOT NULL DEFAULT 'editorial',
 duration INTEGER NOT NULL DEFAULT 240,
 video_id TEXT,
 preview_url TEXT,
 source_url TEXT,
 itunes_id INTEGER,
 metadata_status TEXT NOT NULL DEFAULT 'editorial'
);
CREATE TABLE IF NOT EXISTS history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 track_id INTEGER NOT NULL REFERENCES tracks(id),
 listened_at TEXT,
 event_key TEXT NOT NULL,
 UNIQUE(user_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, track_id);
CREATE TABLE IF NOT EXISTS feedback (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 track_id INTEGER NOT NULL REFERENCES tracks(id),
 preference TEXT CHECK(preference IN ('like','dislike','known') OR preference IS NULL),
 saved INTEGER NOT NULL DEFAULT 0,
 skips INTEGER NOT NULL DEFAULT 0,
 plays INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 PRIMARY KEY(user_id,track_id)
);
CREATE TABLE IF NOT EXISTS imports (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 filename TEXT NOT NULL,
 imported INTEGER NOT NULL,
 duplicates INTEGER NOT NULL,
 skipped INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS api_cache (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_status (
 provider TEXT PRIMARY KEY,
 available INTEGER NOT NULL DEFAULT 0,
 message TEXT NOT NULL,
 checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
PRAGMA user_version = 1;
