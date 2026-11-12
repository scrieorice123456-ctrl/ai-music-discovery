# Installation and deployment

## Local development

Use Node 22.17+ and Python 3.11+ in Linux/macOS/WSL. Install root and frontend npm dependencies with their respective `npm ci` commands and Python dependencies in `.venv`. Copy `.env.example` to `.env` and edit only server-side settings.

`npm run dev` starts two supervised processes: FastAPI on `0.0.0.0:8000` and Vite on `0.0.0.0:5173`. Vite proxies relative `/api` requests to the backend. `.e2b.app` preview hosts are permitted. Ctrl+C stops both children.

`npm run build && npm start` serves the built SPA and API from `0.0.0.0:3000`. This is the recommended preview and deployment layout. The static fallback never turns unknown `/api` routes into HTML.

## Container

```bash
docker compose up --build -d
docker compose logs -f app
curl http://localhost:3000/api/health
```

The multi-stage build ships only Python runtime dependencies and built frontend assets. It runs as UID 10001, not root, and persists SQLite in the `music-data` volume. It includes a health check and one application worker.

For an existing data directory, ensure UID 10001 can write it. Do not mount the whole repository as public static content. `.env`, archives and database files are excluded from the container build context.

## Before personal-data/public use

1. Put an **authenticated HTTPS reverse proxy** or private VPN in front of the app. The app's anonymous per-browser session is not account authentication. A public multi-user SaaS launch needs a proper account/recovery layer first.
2. Set `APP_ENV=production` and `COOKIE_SECURE=true` behind TLS. Secure cookies cannot be used on an ordinary remote HTTP deployment. Do not set them to false to work around a bad TLS proxy.
3. Expose only the production single-origin port. Do not expose Vite or a separate unauthenticated backend port. Keep API and frontend under the same origin; no permissive CORS is needed.
4. Set a real `MUSICBRAINZ_USER_AGENT` identifying the application/version and a contact URL, plus the appropriate `ITUNES_COUNTRY` storefront. Neither service needs a key.
5. Allow outbound HTTPS to `musicbrainz.org` and `itunes.apple.com` from the server, and Apple media/artwork hosts from the browser. Test providers through Settings. Sandbox restrictions are not solved by API credentials.
6. Enforce an upstream request limit of about **31 MB**, timeouts and abuse/rate controls. The app also checks declared and streaming body sizes, upload bytes, ZIP entry counts, uncompressed sizes and event counts.
7. Protect the data volume and backups. SQLite is not encrypted by this app. Use filesystem/volume encryption if necessary; do not publish or commit databases. Cookies are the bearer access to a profile.
8. Decide on retention and backups. Session access lasts 30 days by default. Startup/session-expiry cleanup removes expired users; add an operational scheduled retention/cleanup policy for long-running public deployments. Export before deleting a browser cookie.
9. Keep **one worker** with SQLite and in-process MusicBrainz throttling/jobs. Multiple replicas require a shared DB, distributed throttling/jobs and a stable session/account layer.
10. Confirm privacy/delete/export, upload rejection, real provider lookup, preview availability in your storefront, proxy headers/HTTPS, and session behavior on the deployed domain.

Example reverse-proxy constraints (merge into your authenticated TLS configuration):

```nginx
location / {
    # Add your authentication/SSO gate here.
    client_max_body_size 31m;
    proxy_pass http://app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}
```

If adding trusted forwarded-header parsing, trust only the actual proxy's IP addresses via Uvicorn's `--forwarded-allow-ips`, not arbitrary internet clients. HTTPS cookies are controlled explicitly by configuration. CSP allows Arena/e2b framing for the preview; tighten `frame-ancestors` for a standalone production host if needed.

## Backup and restore

Do not copy a live SQLite file without its WAL. Prefer SQLite's online backup API:

```bash
.venv/bin/python scripts/backup.py /private/backups/music-2026-11-12.sqlite3
```

The destination directory must be private and writable. The script rejects overwriting the active database. To restore: stop the app, replace the configured database using the backup, remove stale WAL/SHM sidecars while stopped, ensure permissions, then restart. Test restoration on a private instance. User JSON export is for portability; it is not a full database/settings/session backup.

## Updates and CI

All work belongs on the active Arena branch. The platform preserves file changes; committing/pushing/PR creation can be done when requested. For later updates, inspect `git status` and `git diff`, run the test/build commands, and never stage `.env`, data, generated artifacts or uploads. Dependency locks and environment examples belong in Git.

GitHub Actions uses a clean SQLite test database and disables external provider access. Browser tests validate the audio path through test-only intercepted responses, not copyrighted bundled audio. Live MusicBrainz/Apple connectivity and playback terms must also be verified in the deployment network.

## Troubleshooting

- **Catalog unreachable:** local discovery is still available. Confirm server egress and retry after the provider backoff; this is not a missing-key error.
- **No official preview:** some songs/storefronts have none, URLs can expire, and browser policy can block playback. Use the official source links or skip; do not substitute another recording.
- **No music events found:** inspect the Takeout file shape and music hints; combined watch histories may need the explicit include-all option. The app cannot reconstruct history that Google did not export.
- **Low metadata coverage:** artist signals still work. Expand the catalog; unfamiliar artists may need future/manual metadata reconciliation.
- **Mix differs from target:** a lane/mood may not have enough unheard candidates. Actual counts are returned by the API; expand the catalog rather than repeating known songs.
- **Session changed/CSRF error:** reload. If cookies are blocked or `COOKIE_SECURE` does not match TLS, correct the deployment/cookie policy.
- **Profile disappeared after clearing cookies:** there is no cloud account/recovery in this version; restore an authorized backup or reimport history.
