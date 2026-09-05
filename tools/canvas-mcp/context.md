# CanvasLMS - API: context

> v1.0.2 (2026-09-05): GET-only retry with jittered backoff and capped `Retry-After`, write-triggered course-cache invalidation, per-call timeout override
>
> v1.0.1 (2026-09-05): `get_all()` discloses page-cap truncation instead of silently dropping items past the 1000-item limit
>
> v1.0.0 (2026-09-02): semver rebaseline; earlier version history folds into it
>
> v1.0.0 (2026-08-24) initial release; marketing site added under web/ the same day

## Purpose

CanvasLMS - API is a local MCP server that exposes a Canvas LMS account to MCP clients (Claude Code, Claude Desktop, Cursor, and others) as roughly 100 tools. It authenticates with the user's own Canvas personal access token, runs entirely on the user's machine, and returns Markdown from every tool. Tools that change Canvas require an explicit `confirm=true` after returning a preview.

## Stack

- Python 3.11+
- FastMCP 3 (`fastmcp>=3.4,<4`) for the MCP server and tool registration
- httpx for the Canvas API client
- python-dotenv for `.env` loading
- Dev/test: pytest, pytest-asyncio, respx, ruff
- Packaging: hatchling, console script `canvaslms-api`

## Layout

```
src/canvaslms_api/
  cli.py        argparse entrypoint: --test, --config, --list-tools, --transport, --version
  server.py     build_server(): FastMCP instance, INSTRUCTIONS text, registers all tool modules
  app.py        App dataclass (settings, client, courses), READ/WRITE/DESTRUCTIVE hint dicts, person()/anonymous_id()
  client.py     CanvasClient (httpx-based), CanvasError
  courses.py    CourseResolver: resolves course id/code/name/sis_course_id: to a numeric id, with caching
  md.py         Markdown-formatting helpers shared by tool modules
  config.py     Settings dataclass, Settings.from_env(), ConfigError, load_env()
  tools/
    identity.py      9 tools : courses & identity
    student.py        9 tools: student-facing tools
    assignments.py    9 tools: assignments & grading
    rubrics.py         6 tools: rubrics
    discussions.py    14 tools: discussions & announcements
    modules.py         8 tools: modules
    pages.py           9 tools: pages
    files.py           4 tools: files
    messaging.py       6 tools: Canvas Inbox
    peer_reviews.py   13 tools: peer review workflow and analytics
    people.py          5 tools: people & privacy
    accessibility.py   5 tools: accessibility scanning and fixes
    migrations.py      2 tools: course content migration/copy
    developer.py       1 tool : search_tools (meta)
  = 100 tools total
```

## Key conventions

- **Per-module registration.** Each `tools/<module>.py` exposes `register(mcp, app)`, called from `server.build_server()` via `tools.registrars()`. New tool modules follow the same signature.
- **Annotation hints.** `app.py` defines `READ`, `WRITE`, `DESTRUCTIVE` hint dicts (`readOnlyHint`, `destructiveHint`, `idempotentHint`) applied to each `@mcp.tool` registration so clients can distinguish safe reads from mutating/destructive calls.
- **Confirm gate.** Every tool that mutates Canvas takes `confirm: bool = false`. Without it, the tool returns a Markdown preview of the change and makes no mutating Canvas request. Called again with `confirm=true`, it performs the change.
- **Markdown helpers.** `md.py` centralizes table/list/heading formatting so every tool's output is consistent Markdown.
- **Course resolution and cache.** `CourseResolver` (`courses.py`) accepts a numeric id, a course code, a partial course name, or `sis_course_id:X`, and resolves it to a Canvas course id. Results are cached for `CANVAS_CACHE_TTL` seconds; `get_cache_status` and `clear_cache` (in `identity.py`) inspect/reset that cache.
- **Error mapping.** `CanvasError` (`client.py`) wraps Canvas API failures; a 403 from an educator-only endpoint surfaces to the caller with a permission hint rather than a raw HTTP error.
- **Anonymization.** When `CANVAS_ANONYMIZE_STUDENTS=true`, `App.person()` returns a stable SHA-256-derived pseudonym (`Student_xxxxxxxx`) instead of the real name; `App.anonymous_id()` computes it, `export_anonymization_map` (in `people.py`) can export the mapping, `get_privacy_status` reports whether anonymization is active.

## Configuration

Loaded from `.env` in the repository root via `Settings.from_env()` (`config.py`):

| Variable | Required | Default |
|---|---|---|
| `CANVAS_URL` | yes |: |
| `CANVAS_TOKEN` | yes |: |
| `CANVAS_TIMEOUT` | no | 30 |
| `CANVAS_CACHE_TTL` | no | 300 |
| `CANVAS_MAX_CONCURRENCY` | no | 5 |
| `CANVAS_ANONYMIZE_STUDENTS` | no | false |
| `CANVAS_DOWNLOAD_DIR` | no | system temp dir |

`CANVAS_URL` must start with `https://`; a trailing `/api/v1` is stripped automatically.

## How to run / test

```
uv venv .venv && uv pip install -e ".[dev]"
canvaslms-api --test          # connection check
canvaslms-api --config        # print resolved settings, token masked
canvaslms-api --list-tools    # print all registered tool names
canvaslms-api                 # run over stdio (default)
canvaslms-api --transport http --host 127.0.0.1 --port 7100
pytest
ruff check .
```

## Ports

HTTP transport default port: **7100** (host `127.0.0.1` by default). Stdio transport (the default) uses no port.

## Known limitations

- No arbitrary code execution (no TypeScript/JS sandbox): every tool is a fixed Canvas API operation.
- No institutional hosting or SSO/OAuth flow: the server is local-only and authenticates with a single personal access token per run.
- Permissions are exactly whatever the configured token's Canvas role grants. A student token cannot exercise educator tools (grading, bulk messaging, content migration, etc.); those calls return the Canvas 403 with a permission hint rather than succeeding partially.

## Presentation (in Helix)

**This package no longer carries a website.** It lived here as `web/` (Next 16,
Tailwind v4, its own orange accent) and was removed when the project merged into
Helix on 2026-09-05, because two sites for one product drift.

The pages now live in the Helix dashboard as ordinary marketing routes, rebuilt on
Helix's own primitives and tokens rather than ported:

| Route | What it is |
|---|---|
| `/canvas` | Hero, worked example, the confirm gate, safety, the 14 groups, install |
| `/canvas/tools` | Searchable explorer over all 100 tools, URL-synced, `#tool_name` deep links |
| `/canvas/skills` | The eight skills in `skills/`, split student and educator |
| `/canvas/changelog` | Renders a mirror of this package's `CHANGELOG.md` |

Source: `apps/dashboard/app/(marketing)/canvas/`, with components under
`apps/dashboard/components/marketing/canvas/` and the catalog in
`apps/dashboard/lib/canvas.ts`. The brand name on those pages is "Canvas Connect";
the package and its console script stay `canvaslms-api`.

**Two generated files must be refreshed here and mirrored there when tools or
releases change**, or the site quietly describes a server that no longer exists:

- `apps/dashboard/public/canvas/tools.json` — dumped from `list_tools()`. The counts
  in `apps/dashboard/lib/canvas.ts` (`TOOL_TOTAL`, `TOOL_READONLY`, `TOOL_CONFIRMED`,
  `TOOL_DESTRUCTIVE`, and `CANVAS_MODULES`) are derived from it and are **not**
  computed at build time, so they need updating in the same pass.
- `apps/dashboard/public/canvas/CHANGELOG.md` — a copy of this file's sibling.

`TOOL_CONFIRMED` is 39 while 40 tools are non-read-only: `clear_cache` mutates only
the in-memory course cache and makes no Canvas request. The site therefore claims
"every tool that changes Canvas", never "every mutating tool".

## Where this sits in Helix

`tools/canvas-mcp/` — alongside `tools/capture` and `tools/antibot-suite`, which are
also not deployables. It is **not** a pnpm workspace member: `pnpm-workspace.yaml`
lists members explicitly and this is a Python package. `pnpm -r test` does not reach
it, so its tests run on their own:

```
cd tools/canvas-mcp
uv venv .venv && uv pip install -e ".[dev]"
pytest
ruff check .
```
