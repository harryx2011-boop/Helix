"""Run helix-scrape: `python -m helix_scrape` in dev, `helix-scrape.exe` frozen."""

from __future__ import annotations

import argparse
import logging
import os
import sys
import urllib.request


def _streams() -> None:
    # A windowed exe starts with no stdout/stderr unless its parent redirects them.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")  # noqa: SIM115
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")  # noqa: SIM115


def _healthcheck(port: int) -> int:
    """For the container healthcheck, so the image needs no curl."""
    try:
        url = f"http://127.0.0.1:{port}/health"
        with urllib.request.urlopen(url, timeout=2) as reply:
            return 0 if reply.status == 200 else 1
    except OSError:
        return 1


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="helix-scrape")
    parser.add_argument("--port", type=int, default=int(os.environ.get("HELIX_SCRAPE_PORT", 7403)))
    parser.add_argument("--host", default=os.environ.get("HELIX_SCRAPE_HOST", "127.0.0.1"))
    parser.add_argument("--healthcheck", action="store_true")
    args = parser.parse_args(argv)

    if args.healthcheck:
        sys.exit(_healthcheck(args.port))

    _streams()
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    import asyncio

    import uvicorn

    from helix_scrape.main import app

    if sys.platform == "win32":  # curl_cffi needs add_reader, which the default Proactor loop lacks
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    uvicorn.run(app, host=args.host, port=args.port, log_config=None)


if __name__ == "__main__":
    main()
