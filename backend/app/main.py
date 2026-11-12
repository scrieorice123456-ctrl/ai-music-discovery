import asyncio
import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from collections import Counter, defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .catalog import normalize, seed_demo_history, track_key
from .config import ROOT, settings
from .db import database, initialize, track_dict
from .importer import ImportError as TakeoutError, parse_takeout
from . import providers
from .limits import BodyLimitMiddleware
from recommendation.engine import build_profile, recommend

_jobs = {}
_tasks = set()
_limits = defaultdict(deque)


@asynccontextmanager
async def lifespan(app):
    initialize()
    with database() as db:
        cutoff = (
            datetime.now(timezone.utc) - timedelta(days=settings.session_days)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        db.execute("DELETE FROM users WHERE created_at < ?", (cutoff,))
        cleanup_import_tracks(db)
    yield
    for task in _tasks:
        task.cancel()
    if _tasks:
        await asyncio.gather(*_tasks, return_exceptions=True)


app = FastAPI(
    title="AI Music Discovery",
    version="1.0.0",
    lifespan=lifespan,
    description="Local history import and transparent personal music recommendations.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.add_middleware(BodyLimitMiddleware)


def cleanup_import_tracks(db):
    db.execute(
        "DELETE FROM tracks WHERE source='import' AND id NOT IN (SELECT track_id FROM history UNION SELECT track_id FROM feedback)"
    )


def get_user(db, user_id):
    return dict(db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())


def visible_tracks(db, user_id):
    return [
        track_dict(r)
        for r in db.execute(
            "SELECT * FROM tracks WHERE source!='import' OR id IN (SELECT track_id FROM history WHERE user_id=? UNION SELECT track_id FROM feedback WHERE user_id=?)",
            (user_id, user_id),
        )
    ]


def get_track(db, user_id, track_id):
    row = db.execute(
        "SELECT * FROM tracks WHERE id=? AND (source!='import' OR id IN (SELECT track_id FROM history WHERE user_id=? UNION SELECT track_id FROM feedback WHERE user_id=?))",
        (track_id, user_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(404, "Track not found.")
    return track_dict(row)


def user_profile(db, user_id):
    tracks = visible_tracks(db, user_id)
    history = [
        dict(r)
        for r in db.execute(
            "SELECT track_id,listened_at FROM history WHERE user_id=?", (user_id,)
        )
    ]
    feedback = [
        dict(r)
        for r in db.execute("SELECT * FROM feedback WHERE user_id=?", (user_id,))
    ]
    return tracks, build_profile(history, feedback, tracks), feedback


def taste_summary(db, user_id, profile=None):
    if profile is None:
        _, profile, _ = user_profile(db, user_id)
    positive = lambda c: [(k, v) for k, v in c.most_common() if k and v > 0]
    genres = positive(profile["genres"])[:6]
    genre_total = sum(v for _, v in genres) or 1
    shares = [int(v / genre_total * 100) for _, v in genres]
    remaining = 100 - sum(shares) if genres else 0
    for index in sorted(
        range(len(genres)),
        key=lambda i: genres[i][1] / genre_total * 100 - shares[i],
        reverse=True,
    )[:remaining]:
        shares[index] += 1
    artists = positive(profile["artists"])[:8]
    listened = db.execute(
        """SELECT COUNT(*) plays, COUNT(DISTINCT h.track_id) tracks,
        COUNT(DISTINCT t.artist) artists,SUM(CASE WHEN t.genres!='[]' THEN 1 ELSE 0 END) enriched
        FROM history h JOIN tracks t ON h.track_id=t.id WHERE h.user_id=?""",
        (user_id,),
    ).fetchone()
    periods = [
        ("Night", 0, 6),
        ("Morning", 6, 12),
        ("Afternoon", 12, 18),
        ("Evening", 18, 24),
    ]
    return {
        "plays": listened["plays"],
        "tracks": listened["tracks"],
        "artists": listened["artists"],
        "metadata_coverage": round(
            100 * (listened["enriched"] or 0) / max(1, listened["plays"])
        ),
        "genres": [{"name": k, "value": shares[i]} for i, (k, v) in enumerate(genres)],
        "top_artists": [
            {
                "name": k,
                "weight": round(v, 2),
                "art": (
                    db.execute(
                        "SELECT art FROM tracks WHERE artist=? AND (source!='import' OR id IN (SELECT track_id FROM history WHERE user_id=?)) ORDER BY id LIMIT 1",
                        (k, user_id),
                    ).fetchone()
                    or {"art": "/art/cover-1.svg"}
                )["art"],
            }
            for k, v in artists
        ],
        "moods": [
            {"name": k, "weight": round(v, 2)} for k, v in positive(profile["moods"])
        ],
        "energy": round(profile["energy"], 2),
        "periods": [
            {
                "name": name,
                "plays": sum(profile["hours"].get(h, 0) for h in range(start, end)),
            }
            for name, start, end in periods
        ],
        "feedback_count": profile["feedback_count"],
        "saved": db.execute(
            "SELECT COUNT(*) FROM feedback WHERE user_id=? AND saved=1", (user_id,)
        ).fetchone()[0],
    }


@app.middleware("http")
async def sessions_and_security(request: Request, call_next):
    new_session = False
    is_api = request.url.path.startswith("/api/") and request.url.path not in (
        "/api/health",
        "/api/docs",
        "/api/openapi.json",
    )
    if is_api:
        declared = request.headers.get("content-length", "0")
        try:
            if int(declared) > settings.max_upload + 1024 * 1024:
                return JSONResponse(
                    {"detail": "Upload exceeds the maximum request size."},
                    status_code=413,
                )
        except ValueError:
            return JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)
        token = request.cookies.get("music_session", "")
        with database() as db:
            user = (
                db.execute("SELECT * FROM users WHERE id=?", (token,)).fetchone()
                if len(token) == 64
                else None
            )
            if user:
                created = datetime.fromisoformat(
                    user["created_at"].replace("Z", "+00:00")
                )
                if datetime.now(timezone.utc) - created > timedelta(
                    days=settings.session_days
                ):
                    db.execute("DELETE FROM users WHERE id=?", (token,))
                    cleanup_import_tracks(db)
                    user = None
            if not user:
                token = secrets.token_hex(32)
                csrf = secrets.token_hex(32)
                db.execute(
                    "INSERT INTO users(id,csrf_token) VALUES(?,?)", (token, csrf)
                )
                seed_demo_history(db, token)
                user = db.execute("SELECT * FROM users WHERE id=?", (token,)).fetchone()
                new_session = True
            request.state.user_id = token
            if request.method in ("POST", "PUT", "PATCH", "DELETE"):
                if not hmac.compare_digest(
                    request.headers.get("x-csrf-token", ""), user["csrf_token"]
                ):
                    return JSONResponse(
                        {
                            "detail": "Your session changed. Reload the page and try again."
                        },
                        status_code=403,
                    )
                bucket = _limits[token]
                now = time.monotonic()
                while bucket and bucket[0] < now - 60:
                    bucket.popleft()
                if len(bucket) >= 90:
                    return JSONResponse(
                        {"detail": "Too many updates. Please try again in a minute."},
                        status_code=429,
                        headers={"Retry-After": "60"},
                    )
                bucket.append(now)
                # Bound in-memory bookkeeping even if many sessions visit.
                if len(_limits) > 10000:
                    for key in list(_limits)[:5000]:
                        if not _limits[key] or _limits[key][-1] < now - 120:
                            del _limits[key]
    response = await call_next(request)
    if new_session:
        # Arena embeds the HTTPS e2b preview cross-site. CHIPS keeps that
        # session private to the embedding site without requiring third-party
        # cookies. Ordinary/self-hosted deployments retain SameSite=Lax.
        embedded_preview = (request.url.hostname or "").endswith(".e2b.app")
        response.set_cookie(
            "music_session",
            token,
            max_age=settings.session_days * 86400,
            httponly=True,
            secure=settings.cookie_secure or embedded_preview,
            samesite="none" if embedded_preview else "lax",
            path="/",
        )
        if embedded_preview:
            # Python 3.11's SimpleCookie does not yet expose Partitioned.
            # Append the standardized attribute to this server-generated
            # opaque cookie; no user input is interpolated into the header.
            response.raw_headers = [
                (name, value + b"; Partitioned")
                if name == b"set-cookie" and value.startswith(b"music_session=")
                else (name, value)
                for name, value in response.raw_headers
            ]
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = (
        "no-store" if request.url.path.startswith("/api/") else "no-cache"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.mzstatic.com; media-src 'self' https://*.itunes.apple.com https://*.mzstatic.com; connect-src 'self'; frame-ancestors 'self' https://*.arena.ai https://arena.ai https://*.e2b.app; base-uri 'self'; form-action 'self'; object-src 'none'"
    )
    return response


@app.exception_handler(sqlite3.Error)
async def database_error(request, exc):
    return JSONResponse(
        {
            "detail": "The music database is busy or unavailable. Please retry in a moment."
        },
        status_code=503,
    )


@app.get("/api/health")
def health():
    with database() as db:
        db.execute("SELECT 1")
    return {"status": "ok", "version": "1.0.0", "database": "sqlite"}


@app.get("/api/bootstrap")
def bootstrap(request: Request):
    with database() as db:
        user = get_user(db, request.state.user_id)
        return {
            "csrf_token": user["csrf_token"],
            "demo": bool(user["is_demo"]),
            "settings": json.loads(user["settings"]),
            "taste": taste_summary(db, user["id"]),
            "providers": [dict(r) for r in db.execute("SELECT * FROM provider_status")],
            "imports": [
                dict(r)
                for r in db.execute(
                    "SELECT id,filename,imported,duplicates,skipped,created_at FROM imports WHERE user_id=? ORDER BY id DESC LIMIT 20",
                    (user["id"],),
                )
            ],
            "catalog_size": db.execute(
                "SELECT COUNT(*) FROM tracks WHERE source!='import'"
            ).fetchone()[0],
            "external_apis_enabled": settings.external_apis,
        }


@app.get("/api/discover")
def discover(
    request: Request,
    mood: Literal["all", "chill", "focus", "energy", "after-hours"] = "all",
    limit: int = 20,
    seed: str = "",
):
    with database() as db:
        user = get_user(db, request.state.user_id)
        tracks, profile, feedback = user_profile(db, user["id"])
        seed = seed[:80] or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        recs = recommend(
            tracks,
            profile,
            json.loads(user["settings"]),
            min(60, max(1, limit)),
            mood,
            seed,
        )
        prefs = {f["track_id"]: f for f in feedback}
        for track in recs:
            f = prefs.get(track["id"], {})
            track["saved"] = bool(f.get("saved"))
            track["liked"] = f.get("preference") == "like"
        actual = Counter(t["lane"] for t in recs)
        return {
            "tracks": recs,
            "actual_mix": dict(actual),
            "total": len(recs),
            "demo": bool(user["is_demo"]),
            "cold_start": not profile["history_count"]
            and not profile["feedback_count"],
            "note": "The mix adapts to available unheard tracks; small catalogs or mood filters may not match the target exactly.",
        }


class RadioRequest(BaseModel):
    mood: Literal["all", "chill", "focus", "energy", "after-hours"] = "all"
    exclude: list[int] = Field(default_factory=list, max_length=1000)
    seed: str = Field(default="", max_length=80)


@app.post("/api/radio/queue")
def radio_queue(body: RadioRequest, request: Request):
    with database() as db:
        user = get_user(db, request.state.user_id)
        tracks, profile, _ = user_profile(db, user["id"])
        recs = recommend(
            tracks,
            profile,
            json.loads(user["settings"]),
            20,
            body.mood,
            body.seed or secrets.token_hex(4),
            body.exclude,
        )
        return {
            "tracks": recs,
            "exhausted": not recs,
            "message": "You’ve explored all available matches. Refresh the catalog or try another mood."
            if not recs
            else "",
        }


@app.get("/api/tracks/{track_id}/preview")
async def preview(track_id: int, request: Request):
    with database() as db:
        track = get_track(db, request.state.user_id, track_id)
    try:
        return await providers.preview_for(track)
    except providers.ProviderUnavailable as exc:
        return {
            "available": False,
            "message": str(exc),
            "source_url": track.get("source_url"),
        }


class FeedbackRequest(BaseModel):
    track_id: int = Field(gt=0)
    action: Literal[
        "like", "dislike", "known", "save", "unsave", "skip", "listen", "clear"
    ]


@app.post("/api/feedback")
def feedback(body: FeedbackRequest, request: Request):
    user_id = request.state.user_id
    with database() as db:
        get_track(db, user_id, body.track_id)
        db.execute(
            "INSERT OR IGNORE INTO feedback(user_id,track_id) VALUES(?,?)",
            (user_id, body.track_id),
        )
        if body.action in ("like", "dislike", "known", "clear"):
            db.execute(
                "UPDATE feedback SET preference=? WHERE user_id=? AND track_id=?",
                (
                    None if body.action == "clear" else body.action,
                    user_id,
                    body.track_id,
                ),
            )
        elif body.action in ("save", "unsave"):
            db.execute(
                "UPDATE feedback SET saved=? WHERE user_id=? AND track_id=?",
                (int(body.action == "save"), user_id, body.track_id),
            )
        elif body.action == "skip":
            db.execute(
                "UPDATE feedback SET skips=skips+1 WHERE user_id=? AND track_id=?",
                (user_id, body.track_id),
            )
        elif body.action == "listen":
            db.execute(
                "UPDATE feedback SET plays=plays+1 WHERE user_id=? AND track_id=?",
                (user_id, body.track_id),
            )
            # A completed official preview is an app listening event, not a full-song claim.
            now = datetime.now(timezone.utc).isoformat()
            key = hashlib.sha256(f"preview:{body.track_id}:{now}".encode()).hexdigest()
            db.execute(
                "INSERT INTO history(user_id,track_id,listened_at,event_key) VALUES(?,?,?,?)",
                (user_id, body.track_id, now, key),
            )
        db.execute(
            "UPDATE feedback SET updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE user_id=? AND track_id=?",
            (user_id, body.track_id),
        )
        return {
            "ok": True,
            "feedback": dict(
                db.execute(
                    "SELECT * FROM feedback WHERE user_id=? AND track_id=?",
                    (user_id, body.track_id),
                ).fetchone()
            ),
        }


class MixSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    similar: int = Field(ge=0, le=100, strict=True)
    discovery: int = Field(ge=0, le=100, strict=True)
    experimental: int = Field(ge=0, le=100, strict=True)

    @model_validator(mode="after")
    def valid_total(self):
        if self.similar + self.discovery + self.experimental != 100:
            raise ValueError("Discovery weights must add up to 100%.")
        return self


@app.put("/api/settings")
def update_settings(body: MixSettings, request: Request):
    with database() as db:
        db.execute(
            "UPDATE users SET settings=? WHERE id=?",
            (body.model_dump_json(), request.state.user_id),
        )
    return {"ok": True, "settings": body.model_dump()}


@app.post("/api/import")
async def import_history(
    request: Request,
    file: UploadFile = File(...),
    include_all_youtube: bool = Form(False),
):
    buffer = bytearray()
    try:
        while chunk := await file.read(1024 * 1024):
            buffer.extend(chunk)
            if len(buffer) > settings.max_upload:
                raise HTTPException(
                    413, f"Maximum upload is {settings.max_upload // 1024 // 1024} MB."
                )
    finally:
        await file.close()
    filename = Path((file.filename or "history.json").replace("\\", "/")).name[:200]
    # Parsing is CPU-bound; keep large imports off the async event loop.
    try:
        result = await asyncio.to_thread(
            parse_takeout, filename, bytes(buffer), include_all_youtube
        )
    except TakeoutError as exc:
        raise HTTPException(422, str(exc)) from exc
    return await asyncio.to_thread(
        store_import, request.state.user_id, filename, result
    )


def store_import(user_id, filename, result):
    imported = 0
    duplicates = 0
    with database() as db:
        user = get_user(db, user_id)
        if user["is_demo"]:
            # The sample profile is replaced atomically, and only after a valid parse.
            db.execute("DELETE FROM history WHERE user_id=?", (user_id,))
            db.execute("DELETE FROM feedback WHERE user_id=?", (user_id,))
            db.execute("UPDATE users SET is_demo=0 WHERE id=?", (user_id,))
        for event in result.events:
            key = track_key(event["artist"], event["title"])
            row = db.execute(
                "SELECT id FROM tracks WHERE normalized_key=?", (key,)
            ).fetchone()
            if row is None and event["video_id"]:
                row = db.execute(
                    "SELECT id FROM tracks WHERE video_id=?", (event["video_id"],)
                ).fetchone()
            if row is None and event["artist"] == "Unknown artist":
                # Use a title-only match only when unambiguous in the public catalog.
                matches = [
                    r
                    for r in db.execute(
                        "SELECT id,title FROM tracks WHERE source!='import'"
                    )
                    if normalize(r["title"]) == normalize(event["title"])
                ]
                if len(matches) == 1:
                    row = matches[0]
            if row is None:
                artist_meta = db.execute(
                    "SELECT genres,moods,energy,valence,family,art FROM tracks WHERE artist=? AND source!='import' LIMIT 1",
                    (event["artist"],),
                ).fetchone()
                values = (
                    dict(artist_meta)
                    if artist_meta
                    else {
                        "genres": "[]",
                        "moods": "[]",
                        "energy": 0.5,
                        "valence": 0.5,
                        "family": "",
                        "art": "/art/cover-1.svg",
                    }
                )
                db.execute(
                    """INSERT OR IGNORE INTO tracks(title,artist,normalized_key,video_id,source,genres,moods,energy,valence,family,art,metadata_status)
                    VALUES(?,?,?,?,'import',?,?,?,?,?,?,?)""",
                    (
                        event["title"],
                        event["artist"],
                        key,
                        event["video_id"],
                        values["genres"],
                        values["moods"],
                        values["energy"],
                        values["valence"],
                        values["family"],
                        values["art"],
                        "artist-inferred" if artist_meta else "unmatched",
                    ),
                )
                row = db.execute(
                    "SELECT id FROM tracks WHERE normalized_key=?", (key,)
                ).fetchone()
            tid = row["id"]
            if event["video_id"]:
                db.execute(
                    "UPDATE tracks SET video_id=COALESCE(video_id,?) WHERE id=?",
                    (event["video_id"], tid),
                )
            cur = db.execute(
                "INSERT OR IGNORE INTO history(user_id,track_id,listened_at,event_key) VALUES(?,?,?,?)",
                (user_id, tid, event["listened_at"], event["event_key"]),
            )
            imported += cur.rowcount
            duplicates += 1 - cur.rowcount
        db.execute(
            "INSERT INTO imports(user_id,filename,imported,duplicates,skipped) VALUES(?,?,?,?,?)",
            (user_id, filename, imported, duplicates, result.skipped),
        )
        summary = taste_summary(db, user_id)
    return {
        "imported": imported,
        "duplicates": duplicates,
        "skipped": result.skipped,
        "files": result.files,
        "warnings": result.warnings,
        "taste": summary,
    }


@app.get("/api/library")
def library(request: Request, view: Literal["saved", "liked", "history"] = "saved"):
    user_id = request.state.user_id
    with database() as db:
        if view == "history":
            rows = db.execute(
                """SELECT t.*,COUNT(h.id) play_count,MAX(h.listened_at) last_played,COALESCE(f.saved,0) saved,
                CASE WHEN f.preference='like' THEN 1 ELSE 0 END liked FROM history h JOIN tracks t ON t.id=h.track_id
                LEFT JOIN feedback f ON f.track_id=t.id AND f.user_id=h.user_id WHERE h.user_id=? GROUP BY t.id ORDER BY last_played DESC LIMIT 500""",
                (user_id,),
            )
        else:
            condition = "f.saved=1" if view == "saved" else "f.preference='like'"
            rows = db.execute(
                f"""SELECT t.*,f.saved,CASE WHEN f.preference='like' THEN 1 ELSE 0 END liked FROM feedback f
                JOIN tracks t ON t.id=f.track_id WHERE f.user_id=? AND {condition} ORDER BY f.updated_at DESC LIMIT 500""",
                (user_id,),
            )
        return {"tracks": [track_dict(r) for r in rows]}


@app.get("/api/search")
async def search(request: Request, q: str = "", online: bool = False):
    query = normalize(q[:200])
    if len(query) < 2:
        return {"tracks": [], "message": "Type at least two characters."}
    message = ""
    if online:
        try:
            await providers.search_itunes(q[:200])
        except providers.ProviderUnavailable as exc:
            message = str(exc)
    with database() as db:
        tracks = [
            t
            for t in visible_tracks(db, request.state.user_id)
            if query in normalize(t["artist"] + " " + t["title"] + " " + t["album"])
        ][:40]
        saved = {
            r["track_id"]: r
            for r in db.execute(
                "SELECT * FROM feedback WHERE user_id=?", (request.state.user_id,)
            )
        }
        for t in tracks:
            f = saved.get(t["id"], {})
            t["saved"] = bool(f["saved"]) if f else False
            t["liked"] = f["preference"] == "like" if f else False
        return {"tracks": tracks, "message": message, "online": online}


async def refresh_catalog(user_id, artists, genres):
    started_at = _jobs.get(user_id, {}).get("started_at", time.monotonic())
    added = set()
    failures = []
    try:
        for artist in artists[:3]:
            try:
                for t in await providers.search_itunes(artist):
                    added.add(t["id"])
            except providers.ProviderUnavailable:
                failures.append("iTunes")
                break
        for genre in genres[:2]:
            try:
                for t in await providers.discover_musicbrainz(genre):
                    added.add(t["id"])
            except providers.ProviderUnavailable:
                failures.append("MusicBrainz")
                break
        _jobs[user_id] = {
            "status": "complete",
            "found": len(added),
            "started_at": started_at,
            "message": f"Found {len(added)} catalog matches. Your radio will use fresh, unheard candidates."
            if added
            else "Catalog services are unreachable in this environment. Your local history and starter-catalog recommendations still work.",
            "unavailable": failures,
        }
    except Exception:
        _jobs[user_id] = {
            "status": "error",
            "found": len(added),
            "started_at": started_at,
            "message": "Catalog refresh could not complete. Your music data is safe; please try again later.",
        }


@app.post("/api/catalog/refresh")
async def start_refresh(request: Request):
    uid = request.state.user_id
    if _jobs.get(uid, {}).get("status") == "running":
        return _jobs[uid]
    if _jobs.get(uid, {}).get("started_at", 0) > time.monotonic() - 60:
        raise HTTPException(
            429, "Please wait a minute before refreshing the catalog again."
        )
    with database() as db:
        _, profile, _ = user_profile(db, uid)
        artists = [k for k, v in profile["artists"].most_common(3) if v > 0]
        genres = [k for k, v in profile["genres"].most_common(2) if v > 0]
    _jobs[uid] = {
        "status": "running",
        "message": "Checking iTunes and MusicBrainz…",
        "started_at": time.monotonic(),
    }
    task = asyncio.create_task(
        refresh_catalog(uid, artists or ["Bonobo"], genres or ["electronic"])
    )
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return _jobs[uid]


@app.get("/api/catalog/status")
def refresh_status(request: Request):
    return _jobs.get(request.state.user_id, {"status": "idle"})


@app.get("/api/profile/export")
def export_profile(request: Request):
    with database() as db:
        user = get_user(db, request.state.user_id)
        history = [
            dict(r)
            for r in db.execute(
                "SELECT t.title,t.artist,t.video_id,h.listened_at FROM history h JOIN tracks t ON t.id=h.track_id WHERE h.user_id=? ORDER BY h.id",
                (user["id"],),
            )
        ]
        feedback = [
            dict(r)
            for r in db.execute(
                "SELECT t.title,t.artist,f.preference,f.saved,f.skips,f.plays FROM feedback f JOIN tracks t ON t.id=f.track_id WHERE f.user_id=?",
                (user["id"],),
            )
        ]
    data = {
        "application": "AI Music Discovery",
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "demo": bool(user["is_demo"]),
        "settings": json.loads(user["settings"]),
        "history": history,
        "feedback": feedback,
    }
    return Response(
        json.dumps(data, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="my-music-discovery.json"'
        },
    )


class ResetRequest(BaseModel):
    demo: bool = False
    confirm: Literal["DELETE MY DATA"]


@app.post("/api/profile/reset")
def reset_profile(body: ResetRequest, request: Request):
    uid = request.state.user_id
    with database() as db:
        db.execute("DELETE FROM history WHERE user_id=?", (uid,))
        db.execute("DELETE FROM feedback WHERE user_id=?", (uid,))
        db.execute("DELETE FROM imports WHERE user_id=?", (uid,))
        db.execute(
            "UPDATE users SET is_demo=?,settings=? WHERE id=?",
            (int(body.demo), '{"similar":50,"discovery":30,"experimental":20}', uid),
        )
        cleanup_import_tracks(db)
        if body.demo:
            seed_demo_history(db, uid)
    _jobs.pop(uid, None)
    return {"ok": True, "demo": body.demo}


# Single-origin production deployment. In development Vite proxies /api to this app.
FRONTEND = ROOT / "frontend/dist"


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "API route not found.")
    target = (FRONTEND / path).resolve()
    if FRONTEND.resolve() in target.parents and target.is_file():
        return FileResponse(target)
    if "." in Path(path).name and path:
        raise HTTPException(404, "Asset not found.")
    if (FRONTEND / "index.html").exists():
        return FileResponse(FRONTEND / "index.html")
    return JSONResponse(
        {
            "message": "Build the frontend with npm run build, or run npm run dev.",
            "api_docs": "/api/docs",
        },
        status_code=503,
    )
