# Architecture and recommendation design

## Request/data flow

```text
React (relative /api, no secrets)
  └─ FastAPI (single origin, HTTP-only session + CSRF)
       ├─ SQLite (WAL, foreign keys, per-user history/feedback/imports)
       ├─ Takeout parser (bounded request → in-memory parse → atomic transaction)
       ├─ Recommendation engine (pure Python, no external calls)
       └─ Public metadata clients (explicit lookup only)
            ├─ iTunes Search API → tracks, official URLs, previews
            └─ MusicBrainz → recordings and genre tags
```

The production server serves the built SPA and API from one origin. Vite only proxies `/api` in development. Media is fetched directly by the browser from approved Apple hosts, after the backend resolves an exact artist/title match. Full listening happens on licensed services, not inside a scraping/downloading proxy.

## Identity and storage

Each browser gets a cryptographically random 256-bit opaque session ID in an HTTP-only SameSite=Lax cookie. Embedded HTTPS `.e2b.app` previews instead use `SameSite=None; Secure; Partitioned` (CHIPS), so the cookie remains private to its top-level embedding site and works without unpartitioned third-party cookies. A top-level preview tab and an Arena-embedded preview can therefore have separate browser profiles. A separate random CSRF token is read via bootstrap and required for every mutation. Session IDs and CSRF tokens are never included in exports. No client-generated user ID is accepted.

`users`, `history`, `feedback`, and `imports` isolate personal state. Public editorial/provider metadata and API response caches are shared. Imported-only recordings are hidden from other sessions, including search, enumeration, preview lookup and feedback APIs. Deletion removes personal rows and orphaned imported-only tracks. Public song metadata need not be deleted simply because someone listened to it.

This is intentionally a private/self-hosted, browser-profile model. Cookies expire after 30 days by default; expired users are purged on startup and when an expired cookie is encountered. Profile export is important before clearing cookies. Authentication, multi-device recovery and scheduled retention policies belong in the next account-oriented milestone.

## Takeout parsing

Supported shapes include Google activity arrays, `history`/`events`/`items`/`activity` wrappers, Takeout HTML outer/content cells, fallback video links, and common CSV column aliases. URLs must have real YouTube hosts and valid 11-character video IDs. Metadata is displayed as text by React; HTML is parsed, never rendered/executed.

A combined `YouTube and YouTube Music` folder alone does not classify all videos as music. Music URL/product/channel hints are used unless users explicitly include all YouTube videos. Artist extraction handles Topic channels and artist–title video names. UTF-8, accented Latin and non-Latin names are preserved in normalization.

Track identity uses normalized artist + title, with video ID reconciliation and unambiguous title-only matching when artist metadata is missing. Event identity hashes the normalized video/artist/title/timestamp tuple. Different timestamps preserve repeat listening; identical events across repeated imports are ignored. Undated events use their deterministic file position as a fallback and carry a warning; their exact time is not invented. Different remasters/live versions can still need human reconciliation.

Import parsing runs off the event loop; storage is one transaction. Only a successful parse replaces the sample profile. All retained data is normalized metadata/events, not the uploaded archive. ZIPs are never extracted to disk. SQLite transactions roll back on failure.

## Taste model

Each listening event contributes a recency weight:

`0.35 + 0.65 × exp(−age_in_days / 120)`

Missing timestamps contribute 0.65. Future dates are clamped to age zero. Per-track repeated listening saturates through `log1p`, preventing one repeated song from dominating. Artist, genre, family/subgenre, and mood counters accumulate weighted evidence.

Explicit likes add 5 implicit-signal units, saves add 0.8, dislikes subtract 3, skips modestly reduce affinity, and completed official previews add a listening event plus a small play signal. A known/disliked track or a track skipped at least three times is excluded from new recommendations. A completed preview is not represented as a full-track listen.

Editorial energy and valence are approximate metadata. Unknown provider energy defaults to a neutral prior; explanations say it has not been analyzed. No audio-feature extraction, deep embeddings or proprietary LLM inference is claimed. Unmatched imports can contribute artist affinity before genre enrichment.

## Recommendation pipeline

1. Exclude imported/listened IDs, canonical known identities, known video IDs, explicit exclusions, dislikes, known feedback and repeatedly skipped tracks.
2. Filter by available mood metadata when a mood is requested.
3. Compute affinity: 36% artist affinity, 35% genre similarity, 19% energy proximity, 10% style/family affinity. Normalize against the user's positive evidence.
4. Classify candidates into **disjoint** lanes:
   - Similar: known/positively weighted artist, but a song absent from available history.
   - Discovery: unknown artist with positive genre/style proximity.
   - Experimental: farther from established tags, connected through energy/relevance.
5. Apply target quotas with largest-remainder rounding. Default 10/6/4 tracks in a 20-track batch. Zero-weight lanes are not used as fallback pools.
6. Prefer one track per artist before reusing an artist to satisfy quotas. Use a stable daily hash jitter for variety, then interleave lanes.
7. Backfill from eligible non-zero lanes if a pool is sparse; report the actual mix rather than mislabeling candidates.

Explanations are generated from actual factors, not an invented match percentage. Cold starts use the starter catalog and explicitly indicate limited profile knowledge. Daily variety is deterministic for a given seed and signal set.

## Catalog and playback behavior

Local catalog search works offline. Explicit online searches send just the entered query to Apple. Catalog expansion sends up to three top artists to Apple and two genre tags to MusicBrainz, caches public responses, then offers their recordings as new candidates. No history archive or account credential is sent.

Search responses are cached for 24 hours by default. Providers have five-second timeouts and a 60-second failure backoff. MusicBrainz requests are serialized and at least 1.1 seconds apart per process; deploy one worker unless introducing a shared rate limiter. The UI polls only an explicitly requested bounded catalog-refresh job.

Radio requests 20 candidates and excludes its current queue when refilling. Completed previews update the profile before selecting the next track. No available preview? The selected recording and explanation remain visible, with licensed source links and a manual next action. No available unheard candidates? The UI discloses exhaustion and offers catalog expansion/retuning; it does not silently recycle known music or manufacture an endless library.

## Extension seams

- Introduce schema-versioned migrations before changing an established database schema (`PRAGMA user_version` starts at 1).
- Add authenticated accounts/recovery and migrate browser-owned profiles explicitly.
- Build asynchronous, rate-limited recording reconciliation/enrichment for unfamiliar imported artists.
- Separate shared metadata and personal identities further when introducing multi-version track resolution.
- Evaluate precision, artist diversity, novelty and feedback satisfaction over time, not arbitrary “AI confidence” percentages.
- Use a licensed playback SDK/OAuth provider only when necessary and after explaining its credentials and terms.
