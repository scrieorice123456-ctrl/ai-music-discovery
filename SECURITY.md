# Security and privacy

## Scope

AI Music Discovery is a local-first, single-origin application with anonymous per-browser profiles, not a public SaaS authentication system. Use a trusted host, HTTPS and an authenticated proxy/private network for personal histories. Protect the server and its SQLite volume. Do not upload private archives into an untrusted preview.

## Implemented controls

- Random 256-bit opaque HTTP-only session cookies, SameSite=Lax and production Secure support (embedded HTTPS e2b previews use SameSite=None; Secure; Partitioned for CHIPS); server-generated per-session CSRF tokens on every mutation.
- Personal history/feedback/imports always scoped to the session. Imported-only metadata is not enumerable by another session. Public catalog/API metadata is shared without personal listening associations.
- Streaming and declared request-size checks, per-file byte limits, ZIP traversal/symlink/encryption/ratio/entry limits and event-count caps. ZIPs are never extracted.
- UTF-8 parsers; Takeout HTML is parsed as data, not executed or embedded. React escapes imported titles/artists. SQL values are parameterized.
- Only server-configured public API endpoints. Remote media and source URLs are HTTPS and limited to approved Apple hosts. No arbitrary user-supplied URL fetcher, audio downloader or music scraper.
- Explicit provider lookups send only required search terms/artist/title/tag names. No paid AI calls, API keys or Google authentication.
- No uploaded archives retained after processing. Normalized data can be exported or deleted with confirmation; private data directories and secret files are ignored by Git and Docker.
- CSP, no-sniff, referrer and permission headers; no permissive CORS; no analytics/tracking SDK. Cookies/CSRF tokens do not appear in exports.
- Mutation throttling, bounded provider timeouts, caching/backoff and MusicBrainz request pacing.

## Operational responsibilities

TLS, strong gateway authentication, trusted forwarding, upstream size/abuse limits, encrypted/protected storage, backups, retention scheduling, dependency updates and secure account recovery are deployment responsibilities. The session cookie is bearer access: clearing/losing it loses access; theft can expose the corresponding profile. The API docs should also sit behind the same authentication gateway. Do not enable multiple workers without distributed provider throttling/session/job planning.

Do not include personal Takeout archives, real history, cookies, API tokens, passwords, `.env`, or databases in issue reports. Report vulnerabilities privately to the repository owner rather than posting sensitive data in a public issue.
