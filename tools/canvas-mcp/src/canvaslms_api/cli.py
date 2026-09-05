from __future__ import annotations

import argparse
import asyncio
import sys

from . import __version__
from .app import build_app
from .client import CanvasError
from .config import ConfigError, Settings


def _print_config(settings: Settings) -> None:
    print("canvaslms-api configuration")
    print(f"  Canvas host:      {settings.host}")
    print(f"  Token:            {settings.masked_token()}")
    print(f"  Timeout:          {settings.timeout:g}s")
    print(f"  Course cache TTL: {settings.cache_ttl}s")
    print(f"  Max concurrency:  {settings.max_concurrency}")
    print(f"  Anonymize:        {settings.anonymize_students}")
    print(f"  Download dir:     {settings.download_dir or '(system temp)'}")


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
        server.run(transport="http", host=args.host, port=args.port, show_banner=False)
    else:
        server.run(transport="stdio", show_banner=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
