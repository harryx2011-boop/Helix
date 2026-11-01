"""The browser tier: /render on Scrapling's patched Chromium (`AsyncStealthySession`).

Scrapling 0.5 has no plain (non-stealth) browser, so the patched one is always used
(docs/adr/0001-scrapling.md). What stays opt-in is behaviour a site would notice: `stealth`
adds canvas noise, a WebRTC lock and a search referer, and `solve_cloudflare` clicks
through a challenge. Neither is ever turned on here by default.

The browser runs on the Chromium Helix already stages for Playwright, so no second browser
is downloaded. Each render gets its own browser and closes it: nothing (cookies, storage,
proxy) carries from one caller to the next, and the API owns host sessions.

Security: unless the operator allowed private addresses, every connection the browser
makes goes through `GuardProxy`, which applies `/fetch`'s rule (resolve once, refuse any
private answer, connect to the checked addresses) to the page, each redirect hop and every
subresource. The page host is checked before a browser starts, and the final URL again
after it stops.

Error text follows the /fetch contract: the API classifies it by substring.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import re
import sys
import time
import weakref
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from helix_scrape.fetcher import _is_literal, _parse, max_body_bytes
from helix_scrape.guard import is_private_host, lookup_public
from helix_scrape.guard_proxy import GuardProxy, Lookup
from helix_scrape.models import CookieIn, RenderRequest, RenderResponse

# Replaced by tests; the guard resolves through it.
LOOKUP: Lookup = lookup_public

# Seconds past the deadline before the caller stops waiting on a browser that will not close.
_CLOSE_GRACE_S = 5
_PRIVATE = "private or local address, which this instance does not fetch"
_REDIRECTED_PRIVATE = "request failed: redirected to a private or local address"
_EXECUTABLES = (
    ("chrome-win64", "chrome.exe"),
    ("chrome-win", "chrome.exe"),
    ("chrome-linux64", "chrome"),
    ("chrome-linux", "chrome"),
)


def _max_renders() -> int:
    try:
        return max(1, int(os.environ["HELIX_SCRAPE_MAX_RENDERS"]))
    except (KeyError, ValueError):
        return 2


# A browser is a few hundred MB and a busy CPU; a crawl must not open dozens at once.
# Renders wait for a slot on the event loop, not in a worker thread: the default executor
# also resolves names for /fetch (loop.getaddrinfo), and queued renders must not fill it.
# One gate per loop (the service has one; each test has its own).
_slots: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def _slot_gate() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    gate = _slots.get(loop)
    if gate is None:
        gate = _slots[loop] = asyncio.Semaphore(_max_renders())
    return gate


def _session_class() -> Any:
    from scrapling.fetchers import AsyncStealthySession

    return AsyncStealthySession


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


def _cookie(cookie: CookieIn, url: str) -> dict[str, Any]:
    out: dict[str, Any] = {"name": cookie.name, "value": cookie.value}
    if cookie.domain:
        out["domain"] = cookie.domain
        out["path"] = cookie.path or "/"
    else:
        out["url"] = url
    if cookie.secure is not None:
        out["secure"] = cookie.secure
    if cookie.http_only is not None:
        out["httpOnly"] = cookie.http_only
    return out


class _LastDocument:
    """Headers of the last main-frame document the page loaded.

    Scrapling's response pairs the first response's headers with the last one's status;
    after a redirect or a solved challenge that would report the 403's `cf-mitigated`
    beside a 200. These are the headers of the page that is returned.

    Also keeps the host:port of every main-frame navigation (the first URL and each redirect
    hop), so a failed render blames the guard only for a refusal on the page's own path.
    """

    def __init__(self) -> None:
        self.headers: dict[str, str] | None = None
        self.navigated: set[str] = set()

    async def setup(self, page: Any) -> None:
        def on_request(request: Any) -> None:
            if request.is_navigation_request() and request.frame == page.main_frame:
                self.navigated.add(_authority(str(request.url)))

        def on_response(response: Any) -> None:
            if response.request.resource_type == "document" and response.frame == page.main_frame:
                self.headers = {str(k).lower(): str(v) for k, v in dict(response.headers).items()}

        page.on("request", on_request)
        page.on("response", on_response)


def _authority(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.hostname}:{parts.port or (443 if parts.scheme == 'https' else 80)}"


def _session_options(
    req: RenderRequest, guard: GuardProxy | None, last: _LastDocument
) -> dict[str, Any]:
    return {
        "page_setup": last.setup,
        "executable_path": chromium_path(),
        "headless": True,
        "retries": 1,
        "timeout": req.timeout_ms,
        "wait": req.wait_ms,
        "wait_selector": req.wait_selector,
        "network_idle": req.network_idle,
        "solve_cloudflare": req.solve_cloudflare,
        "hide_canvas": req.stealth,
        # WebRTC's STUN is UDP, which no HTTP proxy carries: unlocked, a page reaches
        # loopback and LAN around the guard and shows the real address behind a proxy.
        "block_webrtc": req.stealth or guard is not None or bool(req.proxy),
        "google_search": req.stealth,
        "block_ads": req.block_ads,
        "disable_resources": req.disable_resources,
        "extra_headers": req.headers,
        "cookies": [_cookie(c, req.url) for c in req.cookies],
        "proxy": guard.url if guard else req.proxy,
    }


_FORBIDDEN = re.compile(r"unreachable|service|fetch failed", re.IGNORECASE)


def _scrub(text: str) -> str:
    """The API reads these words as "a Helix service is down"; a site error must not say them."""
    return _FORBIDDEN.sub("-", text)


def _describe(
    error: BaseException, req: RenderRequest, guard: GuardProxy | None, last: _LastDocument
) -> str:
    text = str(error).split("\n", 1)[0].strip()
    code = re.search(r"net::ERR_[A-Z_]+", text)
    name = code.group(0) if code else ""
    if guard and name in ("net::ERR_TUNNEL_CONNECTION_FAILED", "net::ERR_PROXY_CONNECTION_FAILED"):
        # Only the page's own path explains a failed navigation; a refused image does not.
        path = last.navigated | {_authority(req.url)}
        if path.intersection(guard.refused):
            return _REDIRECTED_PRIVATE
        if path.intersection(guard.unresolved):
            return "connection failed: dns error: name did not resolve"
    if isinstance(error, TimeoutError) or re.search(r"Timeout \d+ms exceeded", text):
        return f"timeout after {req.timeout_ms}ms"
    if name == "net::ERR_NAME_NOT_RESOLVED":
        return "connection failed: dns error: name not resolved"
    if name:
        return _scrub(f"connection failed: {name}")
    return _scrub(f"request failed: {text}")


def _ended_somewhere_refused(final_url: str, req: RenderRequest, guard: GuardProxy | None) -> bool:
    parts = urlsplit(final_url)
    if not req.allow_private and is_private_host(parts.hostname):
        return True
    if guard is None or not parts.hostname:
        return False
    port = parts.port or (443 if parts.scheme == "https" else 80)
    return f"{parts.hostname}:{port}" in guard.refused


async def _browse(
    req: RenderRequest, guard: GuardProxy | None, last: _LastDocument, started: float
) -> RenderResponse:
    def elapsed() -> int:
        return int((time.monotonic() - started) * 1000)

    async with _session_class()(**_session_options(req, guard, last)) as session:
        page = await session.fetch(req.url)

    final_url = str(page.url)
    if _ended_somewhere_refused(final_url, req, guard):
        return RenderResponse.failure(_REDIRECTED_PRIVATE, elapsed())
    if guard:
        parts = urlsplit(final_url)
        port = parts.port or (443 if parts.scheme == "https" else 80)
        if f"{parts.hostname}:{port}" in guard.unresolved:
            return RenderResponse.failure(
                "connection failed: dns error: name did not resolve", elapsed()
            )

    body = str(page.html_content)
    cap = max_body_bytes()
    if len(body.encode("utf-8")) > cap:
        return RenderResponse.failure(f"body exceeds {cap} bytes", elapsed())
    return RenderResponse(
        success=True,
        status=int(page.status),
        headers=last.headers
        if last.headers is not None
        else {str(k).lower(): str(v) for k, v in dict(page.headers).items()},
        body=body,
        final_url=final_url,
        cookies=[dict(c) for c in page.cookies or ()],
        timing_ms=elapsed(),
    )


async def _render_in_loop(req: RenderRequest, started: float) -> RenderResponse:
    remaining_s = req.timeout_ms / 1000 - (time.monotonic() - started)
    guard = None if req.allow_private or req.proxy else GuardProxy(lookup=LOOKUP)
    last = _LastDocument()
    async with contextlib.AsyncExitStack() as stack:
        if guard:
            await stack.enter_async_context(guard)
        try:
            return await asyncio.wait_for(
                _browse(req, guard, last, started), max(remaining_s, 0.001)
            )
        except TimeoutError:
            error = f"timeout after {req.timeout_ms}ms"
            if req.solve_cloudflare:
                error += " (the Cloudflare challenge was not solved in time)"
            return RenderResponse.failure(error, int((time.monotonic() - started) * 1000))
        except Exception as error:
            failed = RenderResponse.failure(_describe(error, req, guard, last), 0)
            failed.timing_ms = int((time.monotonic() - started) * 1000)
            return failed
    raise AssertionError("unreachable")  # pragma: no cover


def _render_in_thread(req: RenderRequest, started: float) -> RenderResponse:
    """A browser needs subprocess pipes, which the Selector loop uvicorn runs on Windows
    lacks (curl_cffi needs that loop), so each render gets a Proactor loop of its own."""
    factory = asyncio.ProactorEventLoop if sys.platform == "win32" else None
    return asyncio.run(_render_in_loop(req, started), loop_factory=factory)


async def render(req: RenderRequest) -> RenderResponse:
    started = time.monotonic()

    def elapsed() -> int:
        return int((time.monotonic() - started) * 1000)

    try:
        parts = _parse(req.url)
    except ValueError as error:
        return RenderResponse.failure(f"invalid url: {error}", elapsed())
    host = parts.hostname or ""
    if not req.allow_private:
        if is_private_host(host):
            return RenderResponse.failure(_PRIVATE, elapsed())
        # Checked before a browser starts; the guard proxy checks it again on connect.
        if not req.proxy and not _is_literal(host):
            port = parts.port or (443 if parts.scheme == "https" else 80)
            try:
                await LOOKUP(host, port)
            except ValueError as error:
                return RenderResponse.failure(f"{_PRIVATE} ({error})", elapsed())
            except ConnectionError as error:
                return RenderResponse.failure(f"connection failed: {error}", elapsed())

    def remaining_s() -> float:
        return req.timeout_ms / 1000 - (time.monotonic() - started)

    gate = _slot_gate()
    try:
        await asyncio.wait_for(gate.acquire(), max(remaining_s(), 0.001))
    except TimeoutError:
        return RenderResponse.failure(
            f"timeout after {req.timeout_ms}ms (waiting for a free browser)", elapsed()
        )
    # The slot is freed when the thread ends, not when the caller stops waiting: a browser
    # past its deadline still counts until it has closed.
    work = asyncio.ensure_future(asyncio.to_thread(_render_in_thread, req, started))
    work.add_done_callback(lambda _: gate.release())
    try:
        return await asyncio.wait_for(asyncio.shield(work), remaining_s() + _CLOSE_GRACE_S)
    except TimeoutError:
        return RenderResponse.failure(f"timeout after {req.timeout_ms}ms", elapsed())
