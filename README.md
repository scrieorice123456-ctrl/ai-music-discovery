# AI Music Discovery

**Your taste is the starting point. Not the limit.**

A working, local-first personal music DJ: import your YouTube Music listening history, understand your taste, discover unheard music, and shape an automatically refilling radio with feedback. React + TypeScript, FastAPI, SQLite, and an explainable recommendation engine. No paid AI, API keys, or Google account access required.

## What works

- **Takeout import:** bounded ZIP, JSON, HTML, and header-based CSV parsing, timestamp normalization, music filtering, repeat-play preservation, and idempotent event deduplication. ZIPs are read in memory, never extracted.
- **Personalized discovery:** recency-weighted artist, genre/subgenre, style, mood, and approximate energy signals. Imported songs, known tracks, dislikes, and repeatedly skipped songs are excluded.
- **An adjustable DJ:** 50% familiar sounds, 30% new-to-you artists, 20% relevant experiments by default. Three disjoint recommendation lanes, largest-remainder quotas, artist diversity, daily variety, and individual explanations.
- **Feedback that persists:** likes, dislikes, known songs, skips, completed previews, and saved finds update the SQLite profile. Your library, listening-time insights (UTC), and taste dashboard use real stored events.
- **Radio:** play/pause, next/previous, progress/seek, volume/mute, retuning, and queue refills. Only official Apple previews are played. Full listening opens YouTube Music or Apple Music; unavailable previews never get substitute audio.
- **Server-side integrations:** MusicBrainz recording/tag discovery and Apple iTunes music search, artwork, and preview resolution, with response caching, bounded timeouts, backoff, and MusicBrainz rate limiting.
- **Private by design:** opaque HTTP-only per-browser sessions (partitioned Secure cookies for embedded previews), CSRF protection, upload limits, safe URL allowlists, security headers, local processing, export, and confirmed deletion. No API secrets in the frontend.
- **Responsive UI:** keyboard-operable dialogs and sliders, mobile navigation, reduced motion, focus states, and automated WCAG A/AA checks.

### Honest boundaries

The initial experience is explicitly a **sample listening profile**, not an analysis of your Google account. A successful import atomically replaces it. You can also test the actual parser with the included sample JSON.

The editorial starter catalog contains about 100 real recordings and original **illustrative** artwork. It contains no copyrighted audio. Its genre/mood/energy tags are editorial approximations, not inferred from audio or an LLM. Provider-only tracks have no measured energy/mood data. Unknown imports teach artist affinity immediately; richer genre matching depends on metadata coverage and catalog expansion.

“New to you” means absent from the history available to the app, not proof you have never heard a song. Mix targets can deviate with a small catalog or mood filter. The radio refills continuously while unheard matches exist; an offline catalog is finite and exhaustion is shown honestly.

**This Arena sandbox restricts outbound access to MusicBrainz and Apple.** Local import, learning, recommendations, search, and library work without them. Official source links remain available; direct provider lookup and live preview availability must be verified on a deployment with internet access. Provider tests use mocked HTTP responses, not an assertion that the live services were reachable here.

## Quick start

Prerequisites: **Node 22.17+**, **Python 3.11+**, and a POSIX shell (Linux/macOS/WSL).

```bash
# In the repository root
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
npm ci
npm --prefix frontend ci
cp .env.example .env

# Development: Vite :5173 + FastAPI :8000, with a same-origin /api proxy
npm run dev
```

Open `http://localhost:5173`. Both servers bind to `0.0.0.0`; Vite accepts Arena's `.e2b.app` preview hosts. The frontend always uses relative `/api` URLs, never browser-facing loopback addresses.

For a production-like, single-origin preview:

```bash
npm run build
npm start
# http://localhost:3000
```

SQLite is initialized and the public starter catalog seeded on startup. Listening data lives in `data/music.sqlite3` (ignored by Git). API documentation: `/api/docs`; health check: `/api/health`.

### No credentials needed

MusicBrainz and Apple's public iTunes Search API do **not** require API keys. Configure a truthful MusicBrainz identifying User-Agent/contact URL and your iTunes storefront country in `.env`. Google Takeout is a manual file export, not Google OAuth. No paid AI provider is called. Never add secret values to `VITE_*` variables.

## Import your own history

1. Visit [Google Takeout](https://takeout.google.com/). Deselect all, then select **YouTube and YouTube Music** and include **history**.
2. Request a one-time ZIP export with JSON or HTML activity.
3. Open **Import history** and choose the ZIP or its `watch-history.json` / HTML file. CSV is supported with a title/track/song column and optional artist, URL, and time columns.
4. Combined YouTube exports may lack separate music labels. Music URLs, product labels, and Topic/VEVO channels are recognized. Enable **Include all YouTube videos** only if appropriate; ordinary videos can otherwise pollute music taste.
5. Repeat events with different timestamps count as repeat listening. Reimporting the same event does not add duplicates. A failed import never replaces an existing profile.

Defaults: 30 MB compressed upload, 80 MB supported uncompressed content, 100,000 candidate activity events, 2,000 ZIP entries / 100 supported files. Unsafe paths, symlinks, encrypted archives, invalid encoding, and suspicious compression ratios are rejected. Export a smaller date range when needed.

Files are processed **on the app's server**, not by a third-party AI. Do not upload a sensitive archive to an untrusted public host. Original uploads are not retained after parsing (the multipart parser may use temporary files during the request). Normalized music events remain in SQLite until deletion/retention cleanup.

## Test and maintain

```bash
npm test                         # Python parser, API, privacy, recommendation, provider tests
npm run typecheck                # Strict TypeScript
npm run build                    # Production frontend build
npx playwright install --with-deps chromium
npm run test:e2e                  # Desktop + mobile, full browser flows and axe accessibility
npm run format:check
```

In an npm-only sandbox with no browser CDN access:

```bash
PLAYWRIGHT_BUNDLED_CHROMIUM=1 npm run test:e2e
```

The bundled-browser helper extracts npm-supplied Chromium libraries into ignored `.cache/`; no browser binaries are committed. Browser tests use isolated cookies. A short synthetic WAV exists only in a test interception to exercise media completion, never in the application's music catalog.

Playwright starts a built app automatically when port 3000 is unused. If an existing preview is running, it reuses it outside CI. To run against another server: `BASE_URL=https://your-host npm run test:e2e` (ensure that server uses test data).

## Structure

```text
frontend/
  src/components/        Navigation, player, track cards/lists, search and mix dialogs
  src/hooks/             Real audio playback and queue state
  src/pages/             Discover, Radio, Library, Taste, Import, Settings
  public/                Original local artwork and non-private sample history
backend/
  app/main.py            HTTP API, sessions, feedback, profile orchestration, SPA serving
  app/importer.py        Safe Google Takeout parsers
  app/providers.py       Server-only MusicBrainz + iTunes clients and metadata caching
  app/db.py              SQLite connections, schema initialization, track serialization
  app/limits.py          Streaming body-size limits
  tests/                 Parser/engine/API/security/provider tests
recommendation/engine.py Explainable content-based recommendation and taste model
database/schema.sql      Foreign keys, indexes, unique identities, cache and session tables
tests/e2e/               Desktop/mobile browser tests
scripts/                 Development runner and optional sandbox browser helper
docs/                    Architecture, deployment and security notes
```

See [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), and [security](SECURITY.md). A GitHub Actions workflow runs backend tests, TypeScript/build, and desktop/mobile browser checks on pushes and pull requests. Dependency locks are committed; secrets, histories, databases, build products, and uploads are not.

## Deployment

```bash
docker compose up --build -d
# Single-origin app :3000; named SQLite volume persists history
```

For real personal listening data, use HTTPS, `COOKIE_SECURE=true`, a private network or authenticated reverse proxy, persistent storage, request limits, and backups. The built-in cookie isolates browser profiles; it is **not a multi-device account or a production SaaS authentication system**. Never expose the backend dev port separately. See the deployment checklist before public hosting.

## Music data and attribution

- Public MusicBrainz metadata: [musicbrainz.org](https://musicbrainz.org/), subject to its [data licenses](https://musicbrainz.org/doc/About/Data_License) (core data CC0; supplementary data has separate terms).
- Apple metadata, artwork, previews and storefront links: public iTunes Search API, subject to Apple's API/preview terms. No full audio is hosted or downloaded by the backend.
- Starter tags are editorial; original SVG covers are not representations of official album art. The hero illustration is AI-generated original imagery.

Future work: authenticated multi-device profiles, stronger recording/version reconciliation, background metadata matching for unfamiliar imports, larger licensed catalogs, and longitudinal recommendation evaluation. Do not add unnecessary AI API dependencies before evaluating the existing recommender.
