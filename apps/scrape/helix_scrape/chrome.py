"""The headed real-Chrome rule for /render (patchright's advice for the least detectable browser).

Real installed Google Chrome, headed with its window off-screen, one persistent profile folder
per host, and nothing injected: no user agent, headers, viewport or fingerprint. Without a
Chrome, on a Linux box with no display, or with `HELIX_SCRAPE_HEADED=0`, /render keeps the
headless staged Chromium so CI, Docker and the VM still work.

A profile folder opens in one browser at a time, so renders of one host take `profile_lock`.
The Cloudflare solver gets a time budget (`with_challenge_budget`) instead of running for minutes.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from collections.abc import Callable, Iterable, Mapping
from pathlib import Path
from typing import Any

OFF_SCREEN = "--window-position=-32000,-32000"
_DROPPED_FLAGS = ("--start-maximized", "--window-position=")
_WEBRTC_FLAGS = (
    "--webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--force-webrtc-ip-handling-policy",
)
_OFF_VALUES = {"0", "false", "off", "no"}
_DEFAULT_BUDGET_MS = 20_000
_LOCKS = "_helix_profile_locks"
_EXECUTABLES = (
    ("chrome-win64", "chrome.exe"),
    ("chrome-win", "chrome.exe"),
    ("chrome-linux64", "chrome"),
    ("chrome-linux", "chrome"),
)


def chrome_candidates(env: Mapping[str, str], platform: str) -> list[Path]:
    if platform == "win32":
        tail = Path("Google") / "Chrome" / "Application" / "chrome.exe"
        roots = (
            env.get("PROGRAMFILES", r"C:\Program Files"),
            env.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
            env.get("LOCALAPPDATA", ""),
        )
        return [Path(root) / tail for root in roots if root]
    if platform == "darwin":
        return [Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
    return [Path("/opt/google/chrome/chrome"), Path("/usr/bin/google-chrome")]


def find_chrome(candidates: Iterable[Path]) -> str | None:
    for path in candidates:
        if path.is_file():
            return str(path)
    return None


def headed_enabled(env: Mapping[str, str], platform: str, chrome_path: str | None) -> bool:
    if env.get("HELIX_SCRAPE_HEADED", "").strip().lower() in _OFF_VALUES:
        return False
    if chrome_path is None:
        return False
    return not (
        platform.startswith("linux") and not (env.get("DISPLAY") or env.get("WAYLAND_DISPLAY"))
    )


def profile_dir(host: str, env: Mapping[str, str]) -> Path:
    root = env.get("HELIX_SCRAPE_PROFILE_DIR")
    if root:
        base = Path(root)
    elif env.get("LOCALAPPDATA"):
        base = Path(env["LOCALAPPDATA"]) / "Helix" / "chrome-profiles"
    else:
        base = Path.home() / ".helix" / "chrome-profiles"
    name = re.sub(r"[^a-z0-9.-]", "_", host.lower()).strip(".")[:100]
    return base / (name or "_")


def scrapling_flags() -> tuple[str, ...]:
    from scrapling.engines.constants import DEFAULT_ARGS, STEALTH_ARGS

    return tuple(DEFAULT_ARGS) + tuple(STEALTH_ARGS)


def headed_args(base: Iterable[str], *, block_webrtc: bool) -> list[str]:
    args = [a for a in base if not a.startswith(_DROPPED_FLAGS)]
    args.append(OFF_SCREEN)
    if block_webrtc:
        args.extend(flag for flag in _WEBRTC_FLAGS if flag not in args)
    return args


def headed_options(profile: Path, base: Iterable[str], *, block_webrtc: bool) -> dict[str, Any]:
    return {
        "real_chrome": True,
        "headless": False,
        "user_data_dir": str(profile),
        "additional_args": {
            "args": headed_args(base, block_webrtc=block_webrtc),
            "no_viewport": True,
            "viewport": None,
            "screen": None,
            "device_scale_factor": None,
            "color_scheme": None,
        },
    }


def challenge_budget_ms(env: Mapping[str, str]) -> int:
    try:
        value = int(env["HELIX_SCRAPE_CHALLENGE_BUDGET_MS"])
    except (KeyError, ValueError):
        return _DEFAULT_BUDGET_MS
    return value if value > 0 else _DEFAULT_BUDGET_MS


class ChallengeTimeoutError(Exception):
    def __init__(self, ms: int) -> None:
        super().__init__(f"challenge: not solved within {ms}ms")
        self.ms = ms


def with_challenge_budget(base: Any, budget_ms: int, record: Callable[[int], None]) -> Any:
    """A session class whose Cloudflare solver stops after `budget_ms`.

    The solver calls itself again for each retry; only the first call is timed, so the retries
    share the one budget.
    """

    async def solver(self: Any, page: Any, _attempts: int = 0) -> None:
        if _attempts:
            await base._cloudflare_solver(self, page, _attempts)
            return
        started = time.monotonic()
        limit = asyncio.timeout(budget_ms / 1000)
        spent = 0
        try:
            try:
                async with limit:
                    await base._cloudflare_solver(self, page, _attempts)
            finally:
                spent = int((time.monotonic() - started) * 1000)
                record(spent)
        except TimeoutError:
            if limit.expired():
                raise ChallengeTimeoutError(spent) from None
            raise

    return type("BudgetedSession", (base,), {"_cloudflare_solver": solver})


def profile_lock(host: str) -> asyncio.Lock:
    """The lock for one host's profile folder, kept on the running loop (the service has one)."""
    loop = asyncio.get_running_loop()
    locks: dict[str, asyncio.Lock] | None = getattr(loop, _LOCKS, None)
    if locks is None:
        locks = {}
        setattr(loop, _LOCKS, locks)
    return locks.setdefault(host, asyncio.Lock())


def max_renders() -> int:
    try:
        return max(1, int(os.environ["HELIX_SCRAPE_MAX_RENDERS"]))
    except (KeyError, ValueError):
        return 2


# A browser is a few hundred MB and a busy CPU; a crawl must not open dozens at once.
# Renders wait for a slot on the event loop, not in a worker thread: the default executor
# also resolves names for /fetch (loop.getaddrinfo), and queued renders must not fill it.
# One gate per loop (the service has one; each test has its own), kept on the loop itself:
# a semaphore that has waited points back at its loop, so a map keyed by loop never let go.
_GATE = "_helix_render_gate"


def slot_gate() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    gate: asyncio.Semaphore | None = getattr(loop, _GATE, None)
    if gate is None:
        gate = asyncio.Semaphore(max_renders())
        setattr(loop, _GATE, gate)
    return gate


def chromium_path() -> str | None:
    """The staged Chromium: `HELIX_CHROMIUM_PATH`, else the newest `chromium-<rev>` under
    `PLAYWRIGHT_BROWSERS_PATH` (or Playwright's default folder). None lets patchright use
    its own download, which Helix does not ship.
    """
    explicit = os.environ.get("HELIX_CHROMIUM_PATH")
    if explicit:
        return explicit
    root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if not root:
        local = os.environ.get("LOCALAPPDATA")
        root = (
            str(Path(local) / "ms-playwright")
            if local
            else str(Path.home() / ".cache" / "ms-playwright")
        )
    folder = Path(root)
    if not folder.is_dir():
        return None
    revisions = sorted(
        (int(d.name.split("-", 1)[1]), d)
        for d in folder.iterdir()
        if d.is_dir() and re.fullmatch(r"chromium-\d+", d.name)
    )
    for _, directory in reversed(revisions):
        for sub, name in _EXECUTABLES:
            exe = directory / sub / name
            if exe.is_file():
                return str(exe)
    return None
