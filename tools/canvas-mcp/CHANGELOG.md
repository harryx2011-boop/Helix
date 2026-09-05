# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
