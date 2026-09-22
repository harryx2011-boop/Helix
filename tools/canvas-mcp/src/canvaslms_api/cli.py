from __future__ import annotations

import argparse
import asyncio
import csv
import difflib
import json
import os
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

from . import __version__
from .app import App, build_app
from .client import CanvasError
from .config import ConfigError, Settings
from .http_auth import SharedSecretGuard, is_loopback, secret_url
from .privacy import (
    ensure_download_dir,
    guess_period,
    purge_downloads,
    read_periods_file,
    write_periods_file,
)

if TYPE_CHECKING:
    from fastmcp import FastMCP


def _print_config(settings: Settings) -> None:
    print("canvaslms-api configuration")
    print(f"  Canvas host:      {settings.host}")
    print(f"  Token:            {settings.masked_token()}")
    print(f"  Timeout:          {settings.timeout:g}s")
    print(f"  Course cache TTL: {settings.cache_ttl}s")
    print(f"  Max concurrency:  {settings.max_concurrency}")
    print(f"  Student privacy:  {settings.privacy_mode}")
    print(f"  Privacy dir:      {settings.privacy_path}")
    print(f"  Privacy key:      {'CANVAS_PRIVACY_KEY' if settings.privacy_key else '(file in privacy dir)'}")
    print(f"  Download dir:     {settings.download_dir or '(system temp)'}")
    print(f"  HTTP auth token:  {settings.masked_auth_token()}")
    print(f"  Allowed hosts:    {', '.join(settings.allowed_hosts) or '(loopback only)'}")


async def _check(settings: Settings) -> int:
    app = build_app(settings)
    try:
        profile = await app.client.get("/users/self/profile")
        courses = await app.courses.active()
    except CanvasError as exc:
        print(f"Connection failed.\n{exc}", file=sys.stderr)
        return 1
    finally:
        await app.aclose()
    print(f"Connected to {settings.host} as {profile.get('name')} (id {profile.get('id')}).")
    print(f"{len(courses)} active course(s).")
    for course in courses[:10]:
        print(f"  - {course.get('name')} [{course.get('course_code')}] id {course.get('id')}")
    return 0


def _run_http(server: FastMCP, settings: Settings, args: argparse.Namespace) -> int:
    """Serve over HTTP, refusing to expose an unauthenticated server off-loopback."""
    from starlette.middleware import Middleware

    allowed_hosts = list(settings.allowed_hosts) + list(args.allowed_host)
    if not settings.auth_token and (not is_loopback(args.host) or allowed_hosts):
        print(
            "Refusing to serve beyond localhost without CANVAS_MCP_AUTH_TOKEN.\n"
            "Anyone who reaches this port would get full use of your Canvas token.\n"
            "Generate a secret and put it in .env:\n"
            '  python -c "import secrets; print(secrets.token_urlsafe(32))"',
            file=sys.stderr,
        )
        return 2

    if (
        settings.privacy_mode == "strict"
        and (not is_loopback(args.host) or allowed_hosts)
        and not settings.privacy_ack_tunnel
    ):
        print(
            "Refusing to serve beyond localhost in strict privacy mode.\n"
            "A tunnel provider terminates TLS on its own servers, so student data in\n"
            "tool results passes through a third party in the clear. If your school has\n"
            "approved that, set CANVAS_PRIVACY_ACK_TUNNEL=1 in .env.",
            file=sys.stderr,
        )
        return 2

    middleware = None
    if settings.auth_token:
        middleware = [Middleware(SharedSecretGuard, token=settings.auth_token)]
        print(
            "HTTP auth is on. Send 'Authorization: Bearer <CANVAS_MCP_AUTH_TOKEN>', "
            f"or use the URL path {secret_url('', settings.auth_token)}"
        )
    server.run(
        transport="http",
        host=args.host,
        port=args.port,
        show_banner=False,
        middleware=middleware,
        # Naming hosts is inert unless protection is switched on: FastMCP
        # leaves Host/Origin validation off by default.
        host_origin_protection=True if allowed_hosts else None,
        allowed_hosts=allowed_hosts or None,
    )
    return 0


def _add_serve_args(parser: argparse.ArgumentParser, suppress: bool = False) -> None:
    def default(value: Any) -> Any:
        return argparse.SUPPRESS if suppress else value

    parser.add_argument(
        "--transport", choices=["stdio", "http"], default=default("stdio"), help="MCP transport (default stdio)"
    )
    parser.add_argument("--host", default=default("127.0.0.1"), help="bind host for --transport http")
    parser.add_argument("--port", type=int, default=default(7100), help="bind port for --transport http")
    parser.add_argument(
        "--allowed-host",
        action="append",
        default=default([]),
        metavar="HOST",
        help=(
            "extra Host header to accept over --transport http; required when a tunnel "
            "or reverse proxy fronts the server (repeatable)"
        ),
    )


def _parse_value(raw: str) -> Any:
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def _parse_pairs(pairs: list[str], args_json: str | None) -> dict[str, Any]:
    args: dict[str, Any] = json.loads(args_json) if args_json else {}
    if not isinstance(args, dict):
        raise ValueError("--args-json must be a JSON object")
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if not sep or not key:
            raise ValueError(f"expected key=value, got {pair!r}")
        args[key.replace("-", "_")] = _parse_value(value)
    return args


def _confirm_prompt(message: str) -> bool:
    if not sys.stdin.isatty():
        return True
    try:
        return input(f"{message} [y/N] ").strip().lower() in {"y", "yes"}
    except EOFError:
        return False


async def _with_cli_app(settings: Settings, fn) -> int:  # noqa: ANN001
    import logging

    # Tool errors come back as the result; FastMCP's server-side traceback
    # for them is noise in a terminal.
    logging.getLogger("fastmcp").setLevel(logging.CRITICAL)
    app = build_app(settings, surface="cli")
    ensure_download_dir(settings)
    try:
        return await fn(app)
    except CanvasError as exc:
        print(f"Canvas error: {exc}", file=sys.stderr)
        return 1
    finally:
        await app.aclose()


async def _call(settings: Settings, tool: str, args: dict[str, Any], as_json: bool) -> int:
    from fastmcp import Client

    from .server import build_server

    async def run(app: App) -> int:
        server = build_server(app=app)
        tools = {t.name: t for t in await server.list_tools()}
        if tool not in tools:
            close = difflib.get_close_matches(tool, list(tools), n=3)
            hint = f" Did you mean: {', '.join(close)}?" if close else ""
            print(f"Unknown tool {tool!r}.{hint} Run `canvaslms-api tools` to list them.", file=sys.stderr)
            return 2
        annotations = tools[tool].annotations
        destructive = bool(annotations and getattr(annotations, "destructiveHint", False))
        if args.get("confirm") and destructive and not _confirm_prompt(f"{tool} changes Canvas and cannot be undone. Continue?"):
            print("Cancelled.", file=sys.stderr)
            return 1
        async with Client(server) as client:
            result = await client.call_tool(tool, args, raise_on_error=False)
        text = "\n".join(getattr(c, "text", "") for c in result.content)
        if as_json:
            print(json.dumps({"is_error": result.is_error, "text": text, "structured": result.structured_content}, default=str, indent=2))
        else:
            print(text, file=sys.stderr if result.is_error else sys.stdout)
        if result.is_error:
            return 3 if text.startswith(("Refused", "Unknown student label", "Unknown label")) else 1
        return 0

    return await _with_cli_app(settings, run)


async def _list_tools_cmd(settings: Settings, search: str | None) -> int:
    from .server import build_server

    app = build_app(settings, surface="cli")
    try:
        tools = await build_server(app=app).list_tools()
    finally:
        await app.aclose()
    needle = (search or "").casefold()
    shown = 0
    for t in sorted(tools, key=lambda t: t.name):
        summary = (t.description or "").strip().splitlines()[0] if t.description else ""
        if needle and needle not in t.name.casefold() and needle not in summary.casefold():
            continue
        shown += 1
        print(f"{t.name:40} {summary}")
    print(f"{shown} tools")
    return 0


def _require_privacy(settings: Settings) -> bool:
    if settings.privacy_mode == "off":
        print("Student privacy is off (CANVAS_PRIVACY_MODE=off), so there are no labels.", file=sys.stderr)
        return False
    return True


async def _roster(settings: Settings, course: str, out: str | None) -> int:
    if not _require_privacy(settings):
        return 2

    async def run(app: App) -> int:
        cid = await app.course_id(course)
        name = await app.course_name(cid)
        members = [m for m in app.privacy.members(cid) if m.kind != "staff"]
        members.sort(key=lambda m: (m.kind != "student", m.label))
        if out:
            path = Path(out).expanduser()
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w", newline="", encoding="utf-8") as fh:
                writer = csv.writer(fh)
                writer.writerow(["label", "real_name", "canvas_user_id", "kind"])
                for m in members:
                    writer.writerow([m.label, m.name, m.user_id, m.kind])
            print(f"Wrote {len(members)} rows to {path} (readable by you only). Delete it when done.")
            return 0
        print(f"{name}: {len(members)} labelled people. Real names, so keep this off shared screens.")
        print("Do not paste this output into an AI assistant.\n")
        width = max((len(m.label) for m in members), default=5)
        for m in members:
            print(f"  {m.label:<{width}}  {m.name}  (Canvas id {m.user_id}{', guardian' if m.kind == 'observer' else ''})")
        for note in app.privacy.roster_notices([cid]):
            print(note.strip("_"), file=sys.stderr)
        return 0

    return await _with_cli_app(settings, run)


async def _periods(settings: Settings, course: str, sets: list[str]) -> int:
    path = settings.privacy_path / "periods.toml"
    mapping = read_periods_file(path)
    if sets:
        for item in sets:
            section, sep, period = item.partition("=")
            if not sep or not section.strip().isdigit():
                print(f"expected SECTION_ID=PERIOD, got {item!r}", file=sys.stderr)
                return 2
            value = period.strip().lower()
            mapping[section.strip()] = int(value) if value.isdigit() and int(value) > 0 else None
        write_periods_file(path, mapping)
        print(f"Saved {path}. Existing labels keep their period; new students use the new mapping.")

    async def run(app: App) -> int:
        cid = await app.courses.resolve(course)
        sections = await app.client.get_all(f"/courses/{cid}/sections")
        print(f"{'section id':>12}  {'period':>6}  source    name")
        for sec in sections:
            key = str(sec.get("id"))
            if key in mapping:
                period, source = mapping[key], "override"
            else:
                period, source = guess_period(sec.get("name")), "guessed"
            shown = str(period) if period else "none"
            print(f"{key:>12}  {shown:>6}  {source:<8}  {sec.get('name')}")
        print("\nFix a wrong guess with: canvaslms-api privacy periods <course> --set SECTION_ID=PERIOD")
        return 0

    return await _with_cli_app(settings, run)


async def _scan(settings: Settings, source: str, courses: list[str], redact: bool) -> int:
    text = sys.stdin.read() if source == "-" else Path(source).read_text(encoding="utf-8")

    async def run(app: App) -> int:
        privacy = app.privacy
        if not privacy.enabled:
            privacy.mode = "strict"  # a scan is always a strict scan
        if courses:
            ids = [await app.courses.resolve(c) for c in courses]
        else:
            ids = [c.get("id") for c in await app.courses.active() if c.get("id") is not None]
        await privacy.prepare_many(ids)
        for note in privacy.roster_notices(ids):
            print(note.strip("_"), file=sys.stderr)
        found = privacy.findings(text)
        if redact:
            sys.stdout.write(privacy.scrub(text))
            print(f"\n{len(found)} replacement(s).", file=sys.stderr)
            return 0
        if not found:
            print("No roster names, emails, or ids found.")
            return 0
        for line, match, replacement in found:
            print(f"  line {line}: {match!r} -> {replacement}")
        print(f"{len(found)} finding(s). Re-run with --redact to print a cleaned copy.")
        return 3

    return await _with_cli_app(settings, run)


def _purge(settings: Settings, older_than: float | None, crosswalk: bool, yes: bool) -> int:
    removed = purge_downloads(settings, older_than)
    if settings.download_dir_managed:
        print(f"Removed {len(removed)} downloaded file(s) from {settings.download_dir}.")
    else:
        print("Downloads are not purged: CANVAS_DOWNLOAD_DIR points at a folder you manage.")
    if crosswalk:
        from .privacy import Crosswalk

        cw = Crosswalk(settings.privacy_path / "crosswalk.db")
        if not yes and not _confirm_prompt("Delete every student label? New labels will be drawn next time."):
            print("Crosswalk kept.")
            return 1
        print(f"Deleted the crosswalk ({cw.wipe()} labels).")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="canvaslms-api",
        description="CanvasLMS - API: MCP server for your Canvas LMS account, plus a terminal front-end.",
    )
    parser.add_argument("--version", action="version", version=f"canvaslms-api {__version__}")
    parser.add_argument("--test", action="store_true", help="check the Canvas connection and exit")
    parser.add_argument("--config", action="store_true", help="print the resolved configuration and exit")
    parser.add_argument("--list-tools", action="store_true", help="print registered tool names and exit")
    _add_serve_args(parser)

    sub = parser.add_subparsers(dest="command", metavar="COMMAND")
    serve = sub.add_parser("serve", help="run the MCP server (the default with no command)")
    _add_serve_args(serve, suppress=True)

    tools = sub.add_parser("tools", help="list tools with a one-line summary")
    tools.add_argument("--search", help="only tools whose name or summary contains this text")

    call = sub.add_parser(
        "call",
        help="run one tool from the terminal",
        description=(
            "Run a tool through the same server an MCP client uses, privacy layer included. "
            "Arguments are key=value; values are parsed as JSON when they can be "
            "(assignment_id=12, include_names=false, grades='{\"P3-07\": 90}')."
        ),
    )
    call.add_argument("tool")
    call.add_argument("pairs", nargs="*", metavar="key=value")
    call.add_argument("--args-json", help="all arguments as one JSON object")
    call.add_argument("--confirm", action="store_true", help="pass confirm=true (writes happen)")
    call.add_argument("--json", action="store_true", help="print the raw result as JSON")

    privacy = sub.add_parser("privacy", help="student-privacy tools that never go through the assistant")
    psub = privacy.add_subparsers(dest="privacy_command", metavar="ACTION", required=True)
    psub.add_parser("status", help="show the privacy mode and where its files live")
    roster = psub.add_parser("roster", help="show who each label is (terminal only)")
    roster.add_argument("course")
    roster.add_argument("--out", help="write a CSV readable only by you instead of printing")
    periods = psub.add_parser("periods", help="show or fix how sections map to class periods")
    periods.add_argument("course")
    periods.add_argument("--set", action="append", default=[], metavar="SECTION_ID=PERIOD")
    scan = psub.add_parser("scan", help="check text for student names before pasting it anywhere")
    scan.add_argument("source", nargs="?", default="-", help="file to scan, or - for stdin")
    scan.add_argument("--course", action="append", default=[], help="course to load names from (default: all active)")
    scan.add_argument("--redact", action="store_true", help="print the text with names replaced by labels")
    purge = psub.add_parser("purge", help="delete old downloads, and optionally every label")
    purge.add_argument("--older-than", type=float, metavar="DAYS", help="default CANVAS_RETENTION_DAYS")
    purge.add_argument("--crosswalk", action="store_true", help="also delete the label crosswalk (end of term)")
    purge.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    if args.config:
        _print_config(settings)
        return 0
    if args.test:
        return asyncio.run(_check(settings))

    command = args.command
    if command == "tools":
        return asyncio.run(_list_tools_cmd(settings, args.search))
    if command == "call":
        try:
            call_args = _parse_pairs(args.pairs, args.args_json)
        except ValueError as exc:
            print(f"Bad arguments: {exc}", file=sys.stderr)
            return 2
        if args.confirm:
            call_args["confirm"] = True
        return asyncio.run(_call(settings, args.tool, call_args, args.json))
    if command == "privacy":
        action = args.privacy_command
        if action == "status":
            return asyncio.run(_call(settings, "get_privacy_status", {}, False))
        if action == "roster":
            return asyncio.run(_roster(settings, args.course, args.out))
        if action == "periods":
            return asyncio.run(_periods(settings, args.course, args.set))
        if action == "scan":
            return asyncio.run(_scan(settings, args.source, args.course, args.redact))
        if action == "purge":
            return _purge(settings, args.older_than, args.crosswalk, args.yes)

    from .server import build_server

    server = build_server(settings)
    if args.list_tools:
        tools = asyncio.run(server.list_tools())
        for tool in sorted(tools, key=lambda t: t.name):
            print(tool.name)
        print(f"{len(tools)} tools")
        return 0
    if settings.privacy_mode == "off":
        print(
            "Warning: student privacy is off (CANVAS_PRIVACY_MODE=off). Student names and ids "
            "go to the assistant as-is.",
            file=sys.stderr,
        )
    ensure_download_dir(settings)
    purge_downloads(settings)
    if args.transport == "http":
        return _run_http(server, settings, args)
    server.run(transport="stdio", show_banner=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
