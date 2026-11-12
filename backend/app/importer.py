"""Bounded, in-memory Google Takeout parser. Never extracts ZIPs or executes HTML."""

import csv
import hashlib
import io
import json
import re
import stat
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import parse_qs, urlparse
from bs4 import BeautifulSoup
from .catalog import normalize
from .config import settings

SUPPORTED = {".json", ".html", ".htm", ".csv"}


class ImportError(ValueError):
    pass


@dataclass
class ParseResult:
    events: list = field(default_factory=list)
    skipped: int = 0
    files: int = 0
    warnings: list = field(default_factory=list)


def youtube_id(url):
    try:
        parsed = urlparse(url)
        if parsed.hostname in (
            "youtube.com",
            "www.youtube.com",
            "music.youtube.com",
            "m.youtube.com",
        ):
            value = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.hostname == "youtu.be":
            value = parsed.path.strip("/").split("/")[0]
        else:
            return None
        return value if re.fullmatch(r"[A-Za-z0-9_-]{11}", value) else None
    except (ValueError, TypeError):
        return None


def timestamp(value):
    if not value:
        return None
    value = str(value).strip()
    try:
        if re.fullmatch(r"\d{10,13}", value):
            n = int(value)
            return datetime.fromtimestamp(
                n / (1000 if n > 10**11 else 1), timezone.utc
            ).isoformat()
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return (
            dt.replace(tzinfo=dt.tzinfo or timezone.utc)
            .astimezone(timezone.utc)
            .isoformat()
        )
    except (ValueError, OverflowError, OSError):
        for fmt in (
            "%b %d, %Y, %I:%M:%S %p %Z",
            "%d %b %Y, %H:%M:%S %Z",
            "%Y-%m-%d %H:%M:%S",
        ):
            try:
                return (
                    datetime.strptime(value, fmt)
                    .replace(tzinfo=timezone.utc)
                    .isoformat()
                )
            except ValueError:
                pass
    return None


def clean_event(raw, context, index, include_all):
    title = str(raw.get("title") or raw.get("track") or raw.get("song") or "").strip()
    url = str(raw.get("titleUrl") or raw.get("url") or raw.get("video_url") or "")
    artist = str(raw.get("artist") or raw.get("channel") or "").strip()
    subtitles = raw.get("subtitles") or []
    if (
        not artist
        and isinstance(subtitles, list)
        and subtitles
        and isinstance(subtitles[0], dict)
    ):
        artist = str(subtitles[0].get("name", "")).strip()
    products = raw.get("products") or []
    # Takeout's combined product folder is NOT proof a video is music.
    path_context = re.sub(
        r"youtube\s+(?:and|&|și|si|et|und)\s+youtube music", "", context, flags=re.I
    )
    context_text = " ".join(
        [path_context, str(raw.get("header", "")), str(products), url, artist]
    ).lower()
    music_context = any(
        hint in context_text for hint in ("music", " - topic", "vevo")
    ) or bool(raw.get("artist"))
    if (
        not title
        or len(title) > 1500
        or title.lower().startswith(("searched for ", "visited ", "subscribed to "))
    ):
        return None
    if not include_all and not music_context:
        return None
    title = re.sub(
        r"^(?:Watched|Listened to|Vizionat|Ai vizionat|Ați vizionat)\s+",
        "",
        title,
        flags=re.I,
    )
    artist = re.sub(r"\s*-\s*Topic$|VEVO$", "", artist, flags=re.I).strip()
    # Most video titles encode the performer before a spaced dash.
    parts = re.split(r"\s+[–—-]\s+", title, maxsplit=1)
    if len(parts) == 2 and (
        not artist or normalize(parts[0]) in normalize(artist) or not subtitles
    ):
        artist, title = parts
    title = re.sub(
        r"\s*[\[(][^\])]*(?:official|video|audio|lyrics)[^\])]*[\])]",
        "",
        title,
        flags=re.I,
    ).strip()
    artist = artist or "Unknown artist"
    if not title:
        return None
    time = timestamp(
        raw.get("time")
        or raw.get("timestamp")
        or raw.get("date")
        or raw.get("listened_at")
    )
    vid = youtube_id(url)
    canonical = "|".join(
        [vid or "", normalize(artist), normalize(title), time or f"undated:{index}"]
    )
    return {
        "title": title[:500],
        "artist": artist[:300],
        "listened_at": time,
        "video_id": vid,
        "event_key": hashlib.sha256(canonical.encode()).hexdigest(),
    }


def parse_json(content):
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, RecursionError) as exc:
        raise ImportError(
            "This JSON file is invalid or too deeply nested. Export it again from Google Takeout."
        ) from exc
    if isinstance(data, dict):
        data = data.get(
            "history", data.get("events", data.get("items", data.get("activity", [])))
        )
    if not isinstance(data, list):
        raise ImportError(
            "Expected a Google Takeout activity list or a history/events array."
        )
    return [item for item in data if isinstance(item, dict)]


def parse_html(content):
    soup = BeautifulSoup(content, "html.parser")
    entries = (
        soup.select("div.outer-cell")
        or soup.select("div.content-cell")
        or soup.select("article")
    )
    records = []
    if not entries:
        entries = [
            a.parent for a in soup.find_all("a", href=True) if youtube_id(a["href"])
        ]
    for cell in entries:
        links = cell.find_all("a", href=True)
        track = next((a for a in links if youtube_id(a["href"])), None)
        if track is None:
            continue
        channel = next(
            (
                a.get_text(" ", strip=True)
                for a in links
                if a is not track
                and any(x in a["href"] for x in ("/channel/", "/@", "/user/"))
            ),
            "",
        )
        text = cell.get_text(" ", strip=True)
        iso = re.search(r"\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d\d:\d\d)", text)
        human = re.search(
            r"[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2} [AP]M [A-Z]{3}", text
        )
        records.append(
            {
                "title": track.get_text(" ", strip=True),
                "titleUrl": track["href"],
                "channel": channel,
                "header": text[:200],
                "time": (iso or human).group(0) if iso or human else None,
            }
        )
    return records


def parse_csv(content):
    try:
        dialect = csv.Sniffer().sniff(content[:8192], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    if not reader.fieldnames:
        raise ImportError(
            "This CSV needs a header row with title and optionally artist, url, time."
        )
    fields = {normalize(k): k for k in reader.fieldnames if k}
    title_field = next(
        (
            fields[k]
            for k in ("title", "track", "song", "track name", "song title")
            if k in fields
        ),
        None,
    )
    if not title_field:
        raise ImportError(
            "CSV must include a title, track, song, or track name column."
        )
    records = []
    for row in reader:
        normalized = {normalize(k): v for k, v in row.items() if k}
        records.append(
            {
                "title": row.get(title_field),
                "artist": normalized.get("artist") or normalized.get("artist name"),
                "url": normalized.get("url")
                or normalized.get("titleurl")
                or normalized.get("video url"),
                "time": normalized.get("time")
                or normalized.get("timestamp")
                or normalized.get("date")
                or normalized.get("listened at"),
            }
        )
        if len(records) > settings.max_events:
            raise ImportError(
                f"This import exceeds the {settings.max_events:,}-event limit. Split the export into smaller files."
            )
    return records


def parse_takeout(filename, content, include_all=False):
    result = ParseResult()
    if not content:
        raise ImportError("The selected file is empty.")
    if len(content) > settings.max_upload:
        raise ImportError(
            f"File is too large. Maximum upload: {settings.max_upload // 1024 // 1024} MB."
        )
    suffix = PurePosixPath(filename.lower()).suffix
    files = []
    if suffix == ".zip":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                infos = archive.infolist()
                if len(infos) > 2000:
                    raise ImportError(
                        "Too many entries in this ZIP. Export only YouTube and YouTube Music."
                    )
                total = 0
                for info in infos:
                    path = PurePosixPath(info.filename.replace("\\", "/"))
                    if (
                        path.is_absolute()
                        or ".." in path.parts
                        or stat.S_ISLNK(info.external_attr >> 16)
                    ):
                        raise ImportError(
                            "Unsafe paths or symbolic links were found in the ZIP."
                        )
                    if info.flag_bits & 1:
                        raise ImportError("Password-protected ZIPs are not supported.")
                    if info.is_dir() or path.suffix.lower() not in SUPPORTED:
                        continue
                    total += info.file_size
                    if (
                        total > settings.max_uncompressed
                        or info.file_size > settings.max_uncompressed
                    ):
                        raise ImportError(
                            "The uncompressed history exceeds the safe size limit. Export a smaller date range."
                        )
                    if (
                        info.file_size > 1024 * 1024
                        and info.file_size / max(info.compress_size, 1) > 250
                    ):
                        raise ImportError(
                            "This ZIP has an unsafe compression ratio. Import the JSON or HTML file directly."
                        )
                    files.append((str(path), archive.read(info)))
                    if len(files) > 100:
                        raise ImportError(
                            "Too many history files. Export only YouTube and YouTube Music."
                        )
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
            raise ImportError(
                "This ZIP is damaged or uses unsupported compression."
            ) from exc
    elif suffix in SUPPORTED:
        files = [(filename, content)]
    else:
        raise ImportError("Choose a ZIP, JSON, HTML, or CSV file.")
    if not files:
        raise ImportError("No JSON, HTML, or CSV history was found in this ZIP.")
    total_records = 0
    for name, data in files:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ImportError(
                "History must be UTF-8 encoded. Please use a fresh Google Takeout export."
            ) from exc
        ext = PurePosixPath(name.lower()).suffix
        records = (
            parse_json(text)
            if ext == ".json"
            else parse_csv(text)
            if ext == ".csv"
            else parse_html(text)
        )
        result.files += 1
        total_records += len(records)
        if total_records > settings.max_events:
            raise ImportError(
                f"This import exceeds {settings.max_events:,} events. Split it into smaller date ranges."
            )
        for index, raw in enumerate(records):
            event = clean_event(raw, name, index, include_all or ext == ".csv")
            if event:
                result.events.append(event)
            else:
                result.skipped += 1
    if not result.events:
        raise ImportError(
            "No music listening events were found. Use a YouTube Music export, or enable “Include all YouTube videos” for a combined watch history."
        )
    undated = sum(not e["listened_at"] for e in result.events)
    if undated:
        result.warnings.append(
            f"{undated:,} events have no recognized timestamp; they still inform your taste, but not listening-time insights."
        )
    return result
