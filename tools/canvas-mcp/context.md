# CanvasLMS - API: context

> v2.0.0 (2026-09-22): student privacy on by default (`CANVAS_PRIVACY_MODE=strict`): class-period labels (`P3-07`) from a local HMAC crosswalk, roster-driven free-text scrubbing, label -> id/name resolution on input, terminal-only re-identification, audit log, private purged downloads, strict-mode tunnel gate; CLI subcommands (`tools`, `call`, `serve`, `privacy ...`). Plan and remaining work: `PLAN-cli-and-student-privacy.md`
>
> v1.1.0 (2026-09-05): HTTP shared-secret auth (`CANVAS_MCP_AUTH_TOKEN`) so claude.ai custom connectors can reach the server; `--transport http` refuses to bind past localhost without it
>
> v1.0.2 (2026-09-05): GET-only retry with jittered backoff and capped `Retry-After`, write-triggered course-cache invalidation, per-call timeout override
>
> v1.0.1 (2026-09-05): `get_all()` discloses page-cap truncation instead of silently dropping items past the 1000-item limit
>
> v1.0.0 (2026-09-02): semver rebaseline; earlier version history folds into it
>
> v1.0.0 (2026-08-24) initial release; marketing site added under web/ the same day, since moved into Helix

## Purpose

CanvasLMS - API is a local MCP server that exposes a Canvas LMS account to MCP clients (Claude Code, Claude Desktop, Cursor, and others) as roughly 95 tools. It authenticates with the user's own Canvas personal access token, runs entirely on the user's machine, and returns Markdown from every tool. Tools that change Canvas require an explicit `confirm=true` after returning a preview.

## Stack

- Python 3.11+
- FastMCP 3 (`fastmcp>=3.4,<4`) for the MCP server and tool registration
- httpx for the Canvas API client
- starlette for the HTTP transport's auth middleware (also FastMCP's own ASGI layer)
- python-dotenv for `.env` loading
- Dev/test: pytest, pytest-asyncio, respx, ruff
- Packaging: hatchling, console script `canvaslms-api`

## Layout

```
src/canvaslms_api/
  cli.py        argparse entrypoint: --test, --config, --list-tools, --transport, --version,
                and subcommands tools | call | serve | privacy {status,roster,periods,scan,purge}
  server.py     build_server(): FastMCP instance, INSTRUCTIONS text, CanvasErrors + PrivacyGuard middleware
  app.py        App dataclass (settings, client, courses, surface, privacy), READ/WRITE/DESTRUCTIVE hint dicts, person()/user_ref()/anonymous_id()
  privacy.py    Privacy (rosters, labels, scrub, restore_args, audit), Crosswalk (sqlite), period guessing, retention
  client.py     CanvasClient (httpx-based), CanvasError
  courses.py    CourseResolver: resolves course id/code/name/sis_course_id: to a numeric id, with caching
  md.py         Markdown-formatting helpers shared by tool modules
  config.py     Settings dataclass, Settings.from_env(), ConfigError, load_env()
  http_auth.py  SharedSecretGuard ASGI middleware, secret_url(), is_loopback()
  tools/
    identity.py      9 tools : courses & identity
    student.py        9 tools: student-facing tools
    assignments.py    9 tools: assignments & grading
    rubrics.py         6 tools: rubrics
    discussions.py    12 tools: discussions & announcements
    modules.py         8 tools: modules
    pages.py           7 tools: pages
    files.py           4 tools: files
    messaging.py       6 tools: Canvas Inbox
    peer_reviews.py   12 tools: peer review workflow and analytics
    people.py          5 tools: people & privacy
    accessibility.py   5 tools: accessibility scanning and fixes
    migrations.py      2 tools: course content migration/copy
    developer.py       1 tool : search_tools (meta)
  = 95 tools total
```

## Key conventions

- **Per-module registration.** Each `tools/<module>.py` exposes `register(mcp, app)`, called from `server.build_server()` via `tools.registrars()`. New tool modules follow the same signature.
- **Annotation hints.** `app.py` defines `READ`, `WRITE`, `DESTRUCTIVE` hint dicts (`readOnlyHint`, `destructiveHint`, `idempotentHint`) applied to each `@mcp.tool` registration so clients can distinguish safe reads from mutating/destructive calls.
- **Confirm gate.** Every tool that mutates Canvas takes `confirm: bool = false`. Without it, the tool returns a Markdown preview of the change and makes no mutating Canvas request. Called again with `confirm=true`, it performs the change.
- **Markdown helpers.** `md.py` centralizes table/list/heading formatting so every tool's output is consistent Markdown.
- **Course resolution and cache.** `CourseResolver` (`courses.py`) accepts a numeric id, a course code, a partial course name, or `sis_course_id:X`, and resolves it to a Canvas course id. Results are cached for `CANVAS_CACHE_TTL` seconds; `get_cache_status` and `clear_cache` (in `identity.py`) inspect/reset that cache.
- **Error mapping.** `CanvasError` (`client.py`) wraps Canvas API failures; a 403 from an educator-only endpoint surfaces to the caller with a permission hint rather than a raw HTTP error.
- **HTTP auth.** `SharedSecretGuard` (`http_auth.py`) wraps the HTTP app when `CANVAS_MCP_AUTH_TOKEN` is set. It accepts either `Authorization: Bearer <token>` or an `/s/<token>` path prefix, and 401s everything else. The path form is there for claude.ai custom connectors, whose dialog accepts a URL and nothing else. The prefix is moved into the ASGI `root_path` rather than stripped from `path`, because Starlette subtracts `root_path` from `path` when routing and builds redirect URLs from the full `path` -- rewriting `path` would emit redirects that drop the secret and 401.
- **Host validation.** FastMCP defaults `http_host_origin_protection` to `False`, so naming allowed hosts alone does nothing. `_run_http` (`cli.py`) passes `host_origin_protection=True` whenever hosts are named via `CANVAS_MCP_ALLOWED_HOSTS` or `--allowed-host`; a Host outside the list then gets 421. Loopback names are always allowed on top of the configured list.
- **Off-loopback guard.** `--transport http` exits 2 rather than bind past localhost (or accept proxy hostnames) without `CANVAS_MCP_AUTH_TOKEN`: an open port here is equivalent to handing out the Canvas token. Plain loopback serving stays unauthenticated for backwards compatibility.
- **Student privacy (`privacy.py`).** Mode `strict` by default from the environment (`Settings()` also defaults to strict; the test fixture pins `off`). `App.course_id()` loads the course roster into `Privacy` (cached for `CANVAS_CACHE_TTL`), so labels exist before anything renders. The `PrivacyGuard` middleware (`server.py`) wraps every tool call on every surface: it loads rosters (the course argument, or all active courses), resolves labels in arguments via `restore_args` (`ID_ARGS` become Canvas ids; in any other string only a marked label, `{{P3-07}}`, becomes the real name, so text written to Canvas is personal while the model only sees labels, and a bare "room S-61" is left alone), then scrubs the result once (errors of every type and `structured_content` included), and appends an audit line. In strict mode a course-scoped call whose roster failed is refused. `_ScrubLogs` scrubs FastMCP's own log handlers. Code that prints a person uses `app.person(user)`; code that prints a raw user id uses `app.user_ref(uid)`, which returns the label in privacy modes (strict also hides unknown ids behind `Person-<hmac>`). New tools must follow both rules; `tests/test_privacy.py::test_sweep_read_tools_leak_nothing` runs every read tool against a fake Canvas full of student names and fails on any leak.
- **Labels.** `P<period>-<nn>` (or `S-<nn>` without a period). Assigned at random once per (host, HMAC(user id)) in `crosswalk.db`, never reused; period from the student's section name (`guess_period`) or `periods.toml`. Guardians `Guardian-<hmac6>`, off-roster people `Person-<hmac8>`. The HMAC key is `CANVAS_PRIVACY_KEY` or `<privacy dir>/privacy.key`. Never derive an identifier from a bare hash of a Canvas id: ids are enumerable.
- **Re-identification is terminal-only.** `App.surface` is `"cli"` only when `canvaslms-api` subcommands build the app; `export_anonymization_map` refuses on `"mcp"` while privacy is on, and `privacy roster` is the terminal view.

## Configuration

Loaded from `.env` in the repository root via `Settings.from_env()` (`config.py`):

| Variable | Required | Default |
|---|---|---|
| `CANVAS_URL` | yes |: |
| `CANVAS_TOKEN` | yes |: |
| `CANVAS_TIMEOUT` | no | 30 |
| `CANVAS_CACHE_TTL` | no | 300 |
| `CANVAS_MAX_CONCURRENCY` | no | 5 |
| `CANVAS_PRIVACY_MODE` | no | strict |
| `CANVAS_ANONYMIZE_STUDENTS` | no | legacy: true = pseudonymize, false ignored |
| `CANVAS_PRIVACY_DIR` | no | ~/.canvaslms-api |
| `CANVAS_PRIVACY_KEY` | no | key file in privacy dir |
| `CANVAS_RETENTION_DAYS` | no | 30 |
| `CANVAS_PRIVACY_ACK_TUNNEL` | no |: |
| `CANVAS_DOWNLOAD_DIR` | no | privacy dir/downloads (purged), or system temp with privacy off |
| `CANVAS_MCP_AUTH_TOKEN` | no |: |
| `CANVAS_MCP_ALLOWED_HOSTS` | no |: |

`CANVAS_URL` must start with `https://`; a trailing `/api/v1` is stripped automatically.

## How to run / test

```
uv venv .venv && uv pip install -e ".[dev]"
canvaslms-api --test          # connection check
canvaslms-api --config        # print resolved settings, token masked
canvaslms-api --list-tools    # print all registered tool names
canvaslms-api                 # run over stdio (default)
canvaslms-api --transport http --host 127.0.0.1 --port 7100
canvaslms-api --transport http --allowed-host <tunnel host>   # needs CANVAS_MCP_AUTH_TOKEN (+ CANVAS_PRIVACY_ACK_TUNNEL=1 in strict)
canvaslms-api call <tool> key=value ...   # any tool from the terminal, through PrivacyGuard
canvaslms-api privacy roster <course>     # label -> real name, terminal only
pytest
ruff check .
```

## Ports

HTTP transport default port: **7100** (host `127.0.0.1` by default). Stdio transport (the default) uses no port.

## Known limitations

- No arbitrary code execution (no TypeScript/JS sandbox): every tool is a fixed Canvas API operation.
- No institutional hosting or SSO/OAuth flow: the server is local-only and authenticates with a single personal access token per run. Reaching it from claude.ai means running a tunnel to the user's own machine; the connector URL carries a shared secret in its path, which is a bearer credential in URL form, not OAuth. claude.ai will not connect to `localhost`, and free `trycloudflare.com` hostnames change on every tunnel restart.
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
| `/canvas/tools` | Searchable explorer over every tool, URL-synced, `#tool_name` deep links |
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

`TOOL_CONFIRMED` is 37 while 38 tools are non-read-only: `clear_cache` mutates only
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
