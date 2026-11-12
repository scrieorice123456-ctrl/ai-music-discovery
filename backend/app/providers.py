"""Server-only public metadata integrations, with caching and graceful failure.
No API credentials. No listening history is sent: only explicit search terms,
track/artist names on preview lookup, and top artist/genre names on refresh.
"""

import asyncio
import json
import time
from urllib.parse import urlparse
import httpx
from .config import settings
from .db import database
from .catalog import track_key, normalize, GENRE_TAGS

_lock = asyncio.Lock()
_last_mb = 0.0
_backoff = {}


class ProviderUnavailable(Exception):
    pass


def approved_url(value, kind="source"):
    if not isinstance(value, str):
        return None
    try:
        p = urlparse(value)
        host = p.hostname or ""
        if p.scheme != "https" or p.username or p.password:
            return None
        if kind == "source":
            return value if host in ("music.apple.com", "itunes.apple.com") else None
        return (
            value
            if host.endswith(".mzstatic.com")
            or host.endswith(".itunes.apple.com")
            or host == "audio-ssl.itunes.apple.com"
            else None
        )
    except ValueError:
        return None


def status(provider, available, message):
    with database() as db:
        db.execute(
            "INSERT INTO provider_status(provider,available,message) VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET available=excluded.available,message=excluded.message,checked_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')",
            (provider, int(available), message),
        )


async def cached_request(provider, path, params):
    global _last_mb
    key = f"{provider}:{path}:{json.dumps(params, sort_keys=True)}"
    with database() as db:
        row = db.execute(
            "SELECT value,expires_at FROM api_cache WHERE key=?", (key,)
        ).fetchone()
        if row and row["expires_at"] > time.time():
            return json.loads(row["value"])
    if not settings.external_apis:
        raise ProviderUnavailable(
            "External catalog access is disabled in this deployment."
        )
    if _backoff.get(provider, 0) > time.monotonic():
        raise ProviderUnavailable(
            "Provider temporarily unavailable. Local recommendations are still working."
        )
    base = settings.itunes_url if provider == "itunes" else settings.musicbrainz_url
    headers = {
        "User-Agent": settings.musicbrainz_ua
        if provider == "musicbrainz"
        else "AI-Music-Discovery/1.0"
    }
    try:
        if provider == "musicbrainz":
            # MusicBrainz public service policy: <= 1 request per second/process.
            async with _lock:
                await asyncio.sleep(max(0, 1.1 - (time.monotonic() - _last_mb)))
                _last_mb = time.monotonic()
                async with httpx.AsyncClient(
                    timeout=5, follow_redirects=False
                ) as client:
                    response = await client.get(
                        base + path, params=params, headers=headers
                    )
        else:
            async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
                response = await client.get(base + path, params=params, headers=headers)
        response.raise_for_status()
        if len(response.content) > 5 * 1024 * 1024:
            raise ValueError("Provider response too large")
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Unexpected provider response")
    except (httpx.HTTPError, ValueError) as exc:
        _backoff[provider] = time.monotonic() + 60
        status(
            provider,
            False,
            "This server cannot reach the catalog right now. Local discovery remains available.",
        )
        raise ProviderUnavailable(
            "The catalog is unreachable here. Try again later, or open the official music source."
        ) from exc
    with database() as db:
        db.execute(
            "INSERT OR REPLACE INTO api_cache(key,value,expires_at) VALUES(?,?,?)",
            (key, json.dumps(data), time.time() + settings.cache_hours * 3600),
        )
    status(provider, True, "Connected · public metadata, no API key")
    return data


def itunes_track(item):
    if (
        item.get("kind") != "song"
        or not item.get("trackName")
        or not item.get("artistName")
    ):
        return None
    genre = str(item.get("primaryGenreName", "")).lower()
    mapped = {
        "electronica": "electronic",
        "electronic": "electronic",
        "r&b/soul": "soul",
        "alternative": "indie",
        "dance": "house",
        "hip-hop/rap": "hip hop",
        "jazz": "jazz",
        "classical": "classical",
    }.get(genre, genre)
    tags = next(
        (v for k, v in GENRE_TAGS.items() if k == mapped), [mapped] if mapped else []
    )
    return {
        "title": item["trackName"][:500],
        "artist": item["artistName"][:300],
        "album": str(item.get("collectionName", ""))[:500],
        "genres": tags,
        "family": mapped,
        "moods": [],
        "energy": 0.5,
        "valence": 0.5,
        "art": approved_url(item.get("artworkUrl100"), "art") or "/art/cover-1.svg",
        "duration": int(item.get("trackTimeMillis", 240000) / 1000),
        "source": "itunes",
        "preview_url": approved_url(item.get("previewUrl"), "audio"),
        "source_url": approved_url(item.get("trackViewUrl")),
        "itunes_id": item.get("trackId"),
        "metadata_status": "provider",
    }


def save_track(item):
    from .db import track_dict

    with database() as db:
        key = track_key(item["artist"], item["title"])
        db.execute(
            """INSERT INTO tracks (title,artist,normalized_key,album,genres,moods,energy,valence,family,art,duration,source,preview_url,source_url,itunes_id,metadata_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(normalized_key) DO UPDATE SET
           preview_url=COALESCE(excluded.preview_url,tracks.preview_url),source_url=COALESCE(excluded.source_url,tracks.source_url),
           itunes_id=COALESCE(excluded.itunes_id,tracks.itunes_id),
           art=CASE WHEN excluded.source='itunes' THEN excluded.art ELSE tracks.art END,
           genres=CASE WHEN tracks.genres='[]' THEN excluded.genres ELSE tracks.genres END,
           family=CASE WHEN tracks.family='' THEN excluded.family ELSE tracks.family END,
           metadata_status=CASE WHEN tracks.source='import' THEN excluded.metadata_status ELSE tracks.metadata_status END""",
            (
                item["title"],
                item["artist"],
                key,
                item.get("album", ""),
                json.dumps(item.get("genres", [])),
                json.dumps(item.get("moods", [])),
                item.get("energy", 0.5),
                item.get("valence", 0.5),
                item.get("family", ""),
                item.get("art", "/art/cover-1.svg"),
                item.get("duration", 240),
                item.get("source", "musicbrainz"),
                item.get("preview_url"),
                item.get("source_url"),
                item.get("itunes_id"),
                item.get("metadata_status", "provider"),
            ),
        )
        return track_dict(
            db.execute("SELECT * FROM tracks WHERE normalized_key=?", (key,)).fetchone()
        )


async def search_itunes(query, limit=24):
    data = await cached_request(
        "itunes",
        "/search",
        {
            "term": query,
            "entity": "song",
            "media": "music",
            "limit": limit,
            "country": settings.country,
        },
    )
    return [
        save_track(track)
        for item in data.get("results", [])
        if (track := itunes_track(item))
    ]


async def preview_for(track):
    if track.get("preview_url"):
        return {
            "available": True,
            "preview_url": track["preview_url"],
            "source_url": track.get("source_url"),
            "provider": "Apple iTunes",
            "duration": 30,
        }
    results = await search_itunes(f"{track['artist']} {track['title']}", 8)
    # Never attach a different artist's recording as a preview for this song.
    exact = next(
        (
            t
            for t in results
            if normalize(t["artist"]) == normalize(track["artist"])
            and normalize(t["title"]) == normalize(track["title"])
            and t.get("preview_url")
        ),
        None,
    )
    if exact:
        return {
            "available": True,
            "preview_url": exact["preview_url"],
            "source_url": exact.get("source_url"),
            "provider": "Apple iTunes",
            "duration": 30,
        }
    return {
        "available": False,
        "message": "No official preview is available for this recording in your region.",
        "source_url": None,
    }


async def discover_musicbrainz(genre):
    safe = re_escape(genre)
    data = await cached_request(
        "musicbrainz",
        "/recording/",
        {"query": f'tag:"{safe}"', "fmt": "json", "limit": 20},
    )
    result = []
    for record in data.get("recordings", []):
        credits = record.get("artist-credit", [])
        artist = "".join(
            c.get("name", c.get("artist", {}).get("name", "")) + c.get("joinphrase", "")
            for c in credits
            if isinstance(c, dict)
        )
        title = record.get("title", "")
        if not artist or not title:
            continue
        tags = [
            t["name"]
            for t in record.get("tags", [])
            if isinstance(t, dict) and t.get("name")
        ][:8]
        result.append(
            save_track(
                {
                    "title": title[:500],
                    "artist": artist[:300],
                    "album": next(
                        (r.get("title", "") for r in record.get("releases", [])), ""
                    ),
                    "genres": tags or [genre],
                    "family": genre,
                    "moods": [],
                    "source": "musicbrainz",
                    "duration": int(record.get("length", 240000) or 240000) // 1000,
                    "metadata_status": "provider",
                    "art": f"/art/cover-{int(hashlib_short(artist), 16) % 12 + 1}.svg",
                }
            )
        )
    return result


def re_escape(value):
    return "".join(c for c in value if c.isalnum() or c in " -")[:80]


def hashlib_short(value):
    import hashlib

    return hashlib.sha256(value.encode()).hexdigest()[:8]
