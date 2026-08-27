from __future__ import annotations

import argparse
import asyncio
import sys
from typing import TYPE_CHECKING

from . import __version__
from .app import build_app
from .client import CanvasError
from .config import ConfigError, Settings
from .http_auth import SharedSecretGuard, is_loopback, secret_url

if TYPE_CHECKING:
    from fastmcp import FastMCP


def _print_config(settings: Settings) -> None:
    print("canvaslms-api configuration")
    print(f"  Canvas host:      {settings.host}")
    print(f"  Token:            {settings.masked_token()}")
    print(f"  Timeout:          {settings.timeout:g}s")
    print(f"  Course cache TTL: {settings.cache_ttl}s")
    print(f"  Max concurrency:  {settings.max_concurrency}")
    print(f"  Anonymize:        {settings.anonymize_students}")
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="canvaslms-api",
        description="CanvasLMS - API: MCP server for your Canvas LMS account.",
    )
    parser.add_argument("--version", action="version", version=f"canvaslms-api {__version__}")
    parser.add_argument("--test", action="store_true", help="check the Canvas connection and exit")
    parser.add_argument("--config", action="store_true", help="print the resolved configuration and exit")
    parser.add_argument("--list-tools", action="store_true", help="print registered tool names and exit")
    parser.add_argument(
        "--transport", choices=["stdio", "http"], default="stdio", help="MCP transport (default stdio)"
    )
    parser.add_argument("--host", default="127.0.0.1", help="bind host for --transport http")
    parser.add_argument("--port", type=int, default=7100, help="bind port for --transport http")
    parser.add_argument(
        "--allowed-host",
        action="append",
        default=[],
        metavar="HOST",
        help=(
            "extra Host header to accept over --transport http; required when a tunnel "
            "or reverse proxy fronts the server (repeatable)"
        ),
    )
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

    from .server import build_server

    server = build_server(settings)
    if args.list_tools:
        tools = asyncio.run(server.list_tools())
        for tool in sorted(tools, key=lambda t: t.name):
            print(tool.name)
        print(f"{len(tools)} tools")
        return 0
    if args.transport == "http":
        return _run_http(server, settings, args)
    server.run(transport="stdio", show_banner=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
