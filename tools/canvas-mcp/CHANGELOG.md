# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.0.0] - 2026-09-22

Student privacy is now on by default. This changes what every tool returns, hence the major version.

### Added

- Class-period student labels. Students appear as `P3-07` (period 3, student 07), or `S-07` when their section has no period. The period is read from the Canvas section name, and `periods.toml` can override it. Numbers are drawn at random once per student and never reused, so they reveal nothing about name order and don't shift when someone adds or drops. Guardians appear as `Guardian-xxxxxx`, and anyone not on a loaded roster as `Person-xxxxxxxx`.
- A local crosswalk (`~/.canvaslms-api/crosswalk.db`, mode 0600) that stores a keyed HMAC of each Canvas user id with its label. It holds no ids and no names.
- Free-text scrubbing on every tool result, error messages included. Roster names (full, sortable, short, and each name part), emails, login ids and SIS ids are replaced with the matching label, or with `[student]` when a name is shared. In strict mode, any other email or phone number is also redacted.
- Label resolution on the way in. A label is accepted anywhere a tool takes a student's user id (`user_id`, `student_id`, `reviewer_id`, `reviewee_id`, `recipients`, `recipient_ids`, `grades` keys). A label in text bound for Canvas becomes the student's real name on this machine, just before the request, and the tool result says so.
- `CANVAS_PRIVACY_MODE` (`off` | `pseudonymize` | `strict`, default `strict`), `CANVAS_PRIVACY_DIR`, `CANVAS_PRIVACY_KEY`, `CANVAS_RETENTION_DAYS`, `CANVAS_PRIVACY_ACK_TUNNEL`.
- A local audit log (`audit.jsonl`): tool, course, confirm, outcome and the labels involved. It never records names or free text.
- CLI subcommands: `tools [--search]`, `call <tool> key=value ... [--confirm] [--json]`, `serve`, and `privacy status | roster | periods | scan | purge`. `call` goes through the same server and privacy layer as an MCP client. `privacy roster` is the only place a label is shown next to a real name. `privacy scan --redact` cleans text before it is pasted anywhere.

### Changed

- **Pseudonyms are keyed.** They used to be `sha256(host:user_id)`. Canvas user ids are small, enumerable integers, so anyone could hash every id and reverse the mapping. They now use HMAC-SHA256 under a per-install key (generated into the privacy dir, or taken from `CANVAS_PRIVACY_KEY`).
- **Privacy is on by default (`strict`).** `CANVAS_ANONYMIZE_STUDENTS=true` still works and means `pseudonymize`. Setting it to `false` no longer turns privacy off, because `.env.example` shipped with that line and it is in most `.env` files without anyone having chosen it. Only `CANVAS_PRIVACY_MODE=off` turns privacy off, and the server then warns on every start.
- In strict mode, raw student user ids in tables and fallbacks are shown as labels.
- `export_anonymization_map` refuses over MCP whenever privacy is on, because the map is what undoes the labels. It still runs from the terminal (`canvaslms-api call` or `privacy roster --out`). It writes `label` instead of `anonymous_id`, with file mode 0600.
- With privacy on and no `CANVAS_DOWNLOAD_DIR`, downloads go to `~/.canvaslms-api/downloads` (mode 0700) instead of the shared temp dir. Files older than `CANVAS_RETENTION_DAYS` (default 30) are purged when the server starts. A `CANVAS_DOWNLOAD_DIR` you set yourself is never purged.
- In strict mode, `--transport http` refuses to serve through a tunnel or off-loopback unless `CANVAS_PRIVACY_ACK_TUNNEL=1`, because the tunnel provider sees tool results in the clear.
- `extract_peer_review_dataset` uses labels when privacy is on, so its rows join with every other tool's output.
- `get_privacy_status` reports the mode, label scheme, crosswalk, key source, audit log and retention. It never returns the map.

### Removed

Five tools were folded into near-duplicates (100 -> 95):

- `delete_announcement` and `delete_announcements_matching` -> `delete_announcements`, which takes `announcement_ids` or the title/date filters. `require_title_match` still works with exactly one id.
- `get_page_content` and `get_front_page` -> `get_page`, which now returns metadata plus the full body (`max_chars` caps it). Pass `page="front_page"` for the front page.
- `list_peer_reviews` -> `get_peer_review_assignments`, which gains its review id, comment count and last-comment columns.

## [1.1.0] - 2026-09-05

### Added

- Shared-secret authentication for the HTTP transport (`CANVAS_MCP_AUTH_TOKEN`), accepted either as an `Authorization: Bearer` header or as an `/s/<token>` URL path prefix. The path form exists for claude.ai custom connectors, whose setup dialog takes a URL and nothing else.
- `CANVAS_MCP_ALLOWED_HOSTS` and `--allowed-host` to name the hostnames a tunnel or reverse proxy puts in the `Host` header. Setting either turns on Host/Origin validation, which FastMCP leaves off by default.
- README instructions for connecting the server to Claude on the web through a tunnel.

### Changed

- `--transport http` refuses to start when it would listen beyond localhost without `CANVAS_MCP_AUTH_TOKEN` set. Unauthenticated loopback serving is unchanged.
- `--config` reports whether an HTTP auth token is set, masked, along with the allowed hosts.

## [1.0.2] - 2026-09-05

### Changed

- GET/HEAD requests now retry transient failures (502/503/504, and connection-level errors like timeouts and resets) with jittered exponential backoff, in addition to the existing 429 handling. POST/PUT/DELETE are never retried, on either a retryable status or a retryable exception, since a write may have partially succeeded.
- A 429 or 503 response's `Retry-After` header is honored when present, capped at 30 seconds so a large server-requested wait can't stall a call past what its own per-tool timeout budget can tolerate; otherwise falls back to the jittered backoff.
- Writes that change course content (`create_content_migration`, `clear_cache`) now invalidate the in-memory course-resolution cache, and `get_cache_status` reports which tool last invalidated it. Previews and failed writes leave the cache untouched.
- Slow-running tools (`bulk_grade_submissions`, `bulk_update_pages`, `create_content_migration`, file downloads) now pass a longer per-call timeout instead of sharing the 30s default meant for ordinary API calls.

## [1.0.1] - 2026-09-05

### Fixed

- `get_all()` now returns a `PageList` carrying whether the 1000-item page cap was hit, and every listing tool appends a notice stating the shown count when it was. Previously a course with more than 1000 modules, files, discussion entries, etc. silently dropped items past the cap with no indication to the model or user.

## [1.0.0] - 2026-08-24

### Added

- Initial release of CanvasLMS - API, an MCP server exposing a Canvas LMS account as roughly 100 tools over stdio or HTTP transport.
- Course, assignment, grading, rubric, discussion, module, page, file, messaging, peer review, people/privacy, accessibility, and course-copy tool groups.
- Confirm-gated write tools: every tool that changes Canvas previews the change and requires `confirm=true` to apply it.
- Flexible course identifiers: numeric id, course code, partial course name, or `sis_course_id:X`.
- Course-resolution caching with configurable TTL, plus `get_cache_status` and `clear_cache`.
- Optional student anonymization (`CANVAS_ANONYMIZE_STUDENTS`) with a stable per-course pseudonym and `export_anonymization_map`.
- CLI with `--test`, `--config`, `--list-tools`, `--transport`, `--host`, `--port`, and `--version`.
- Markdown output for every tool.
- Test suite (pytest, pytest-asyncio, respx) and ruff linting.
- Docker image with `canvaslms-api` entrypoint.
