"""Run helix-extract: `python -m helix_extract` in dev, `helix-extract.exe` frozen."""

from __future__ import annotations

import argparse
import logging
import multiprocessing
import os
import sys


def _streams() -> None:
    # A windowed exe starts with no stdout/stderr unless its parent redirects
    # them, and tqdm, print and logging all crash writing to None.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")  # noqa: SIM115
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")  # noqa: SIM115


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="helix-extract")
    parser.add_argument("--port", type=int, default=7402)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args(argv)

    _streams()
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    import uvicorn

    from helix_extract.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_config=None)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
