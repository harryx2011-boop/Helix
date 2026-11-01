"""/render: the browser rung on Scrapling's patched Chromium.

Most tests swap the browser session for a recorder, so they check what is asked of the
browser without launching one. The `browser` tests at the end drive the real Chromium and
are skipped when none is installed.
"""

from __future__ import annotations

import asyncio
import http.server
import threading
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar

import pytest

from helix_scrape import render as render_module
from helix_scrape.models import RenderIdentity, RenderRequest, Screen
from helix_scrape.render import chromium_path, render


@dataclass
class _Page:
    status: int = 200
    headers: dict[str, str] = field(default_factory=lambda: {"content-type": "text/html"})
    html_content: str = "<html><body>rendered</body></html>"
    url: str = "https://example.com/"
    cookies: tuple[dict[str, Any], ...] = ()


class _Recorder:
    """Stands in for AsyncStealthySession and keeps the options it was opened with."""

    opened: ClassVar[list[dict[str, Any]]] = []
    page = _Page()
    delay_s = 0.0
    error: Exception | None = None

    # Document responses the fake page emits, in order (redirects and a solved challenge
    # load more than one).
    documents: ClassVar[list[dict[str, str]]] = []
    # Main-frame navigations the fake page emits as requests (the first URL, then hops).
    navigations: ClassVar[list[str]] = []
    # host:port the fake browser opens through the guard proxy (CONNECT), page or not.
    connects: ClassVar[list[str]] = []
    # Sessions fetching at once, and the most there ever were.
    active = 0
    peak = 0
    _lock = threading.Lock()

    def __init__(self, **kwargs: Any) -> None:
        _Recorder.opened.append(kwargs)
        self._kwargs = kwargs

    async def __aenter__(self) -> _Recorder:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def fetch(self, url: str) -> _Page:
        with _Recorder._lock:
            _Recorder.active += 1
            _Recorder.peak = max(_Recorder.peak, _Recorder.active)
        try:
            if self.delay_s:
                await asyncio.sleep(self.delay_s)
        finally:
            with _Recorder._lock:
                _Recorder.active -= 1
        fake = _FakeBrowserPage()
        setup = self._kwargs.get("page_setup")
        if setup is not None:
            await setup(fake)
        for target in self.navigations:
            fake.emit("request", _FakeRequest(fake.main_frame, target))
        for authority in self.connects:
            await _connect_through(self._kwargs["proxy"], authority)
        if self.error:
            raise self.error
        for headers in self.documents:
            fake.emit("response", _FakeResponse(fake.main_frame, headers))
        return self.page


async def _connect_through(proxy: str, authority: str) -> None:
    host, _, port = proxy.removeprefix("http://").rpartition(":")
    reader, writer = await asyncio.open_connection(host, int(port))
    writer.write(f"CONNECT {authority} HTTP/1.1\r\nHost: {authority}\r\n\r\n".encode())
    await writer.drain()
    await reader.read()
    writer.close()


class _FakeRequest:
    resource_type = "document"

    def __init__(self, frame: object, url: str) -> None:
        self.frame = frame
        self.url = url

    def is_navigation_request(self) -> bool:
        return True


class _FakeResponse:
    def __init__(self, frame: object, headers: dict[str, str]) -> None:
        self.frame = frame
        self.headers = headers
        self.request = type("R", (), {"resource_type": "document"})()


class _FakeBrowserPage:
    def __init__(self) -> None:
        self.main_frame = object()
        self._handlers: dict[str, list[Any]] = {}

    def on(self, event: str, handler: Any) -> None:
        self._handlers.setdefault(event, []).append(handler)

    def emit(self, event: str, payload: object) -> None:
        for handler in self._handlers.get(event, []):
            handler(payload)


@pytest.fixture
def recorder(monkeypatch: pytest.MonkeyPatch) -> Iterator[type[_Recorder]]:
    _Recorder.opened = []
    _Recorder.page = _Page()
    _Recorder.delay_s = 0.0
    _Recorder.error = None
    _Recorder.documents = []
    _Recorder.navigations = []
    _Recorder.connects = []
    _Recorder.active = 0
    _Recorder.peak = 0
    monkeypatch.setattr(render_module, "_session_class", lambda: _Recorder)

    async def public(host: str, port: int) -> list[str]:
        return ["93.184.215.14"]

    monkeypatch.setattr(render_module, "LOOKUP", public)
    yield _Recorder


# --- the private-address guard -------------------------------------------------------


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1:8080/", "http://localhost/admin", "http://[::1]/", "http://10.1.2.3/"]
)
async def test_a_private_page_host_is_refused_before_a_browser_starts(
    recorder: type[_Recorder], url: str
) -> None:
    result = await render(RenderRequest(url=url))
    assert not result.success
    assert result.error == "private or local address, which this instance does not fetch"
    assert recorder.opened == []


async def test_a_name_that_resolves_privately_is_refused_before_a_browser_starts(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def private(host: str, port: int) -> list[str]:
        raise ValueError("resolves to a private or local address (192.168.0.4)")

    monkeypatch.setattr(render_module, "LOOKUP", private)
    result = await render(RenderRequest(url="https://intranet.example/"))
    assert not result.success
    assert result.error is not None and "private or local address" in result.error
    assert recorder.opened == []


async def test_every_browser_connection_goes_through_the_guard(recorder: type[_Recorder]) -> None:
    await render(RenderRequest(url="https://example.com/"))
    proxy = recorder.opened[0]["proxy"]
    assert proxy.startswith("http://127.0.0.1:")


async def test_a_page_that_ends_on_a_refused_host_is_a_failure(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    recorder.page = _Page(url="http://localhost:9/secret", html_content="<p>secret</p>")
    result = await render(RenderRequest(url="https://example.com/"))
    assert not result.success
    assert result.error == "request failed: redirected to a private or local address"
    assert result.body is None


_TUNNEL_FAILED = RuntimeError(
    "Page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at https://example.com/"
)


async def test_a_refused_subresource_does_not_explain_an_unrelated_tunnel_failure(
    recorder: type[_Recorder],
) -> None:
    recorder.navigations = ["https://example.com/"]
    recorder.connects = ["localhost:443"]  # an image or script the guard refused
    recorder.error = _TUNNEL_FAILED
    result = await render(RenderRequest(url="https://example.com/"))
    assert result.error == "connection failed: net::ERR_TUNNEL_CONNECTION_FAILED"


async def test_a_main_frame_redirect_the_guard_refused_is_named(
    recorder: type[_Recorder],
) -> None:
    recorder.navigations = ["https://example.com/", "https://localhost/admin"]
    recorder.connects = ["localhost:443"]
    recorder.error = _TUNNEL_FAILED
    result = await render(RenderRequest(url="https://example.com/"))
    assert result.error == "request failed: redirected to a private or local address"


async def test_an_unresolved_subresource_does_not_explain_an_unrelated_tunnel_failure(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def lookup(host: str, port: int) -> list[str]:
        if host == "cdn.invalid":
            raise ConnectionError("name did not resolve")
        return ["93.184.215.14"]

    monkeypatch.setattr(render_module, "LOOKUP", lookup)
    recorder.navigations = ["https://example.com/"]
    recorder.connects = ["cdn.invalid:443"]
    recorder.error = _TUNNEL_FAILED
    result = await render(RenderRequest(url="https://example.com/"))
    assert result.error == "connection failed: net::ERR_TUNNEL_CONNECTION_FAILED"


async def test_a_caller_proxy_is_used_as_given(recorder: type[_Recorder]) -> None:
    await render(RenderRequest(url="https://example.com/", proxy="http://proxy.example:8080"))
    assert recorder.opened[0]["proxy"] == "http://proxy.example:8080"


async def test_allow_private_runs_without_the_guard(recorder: type[_Recorder]) -> None:
    result = await render(RenderRequest(url="http://127.0.0.1:9/", allow_private=True))
    assert result.success
    assert recorder.opened[0].get("proxy") is None


# --- options ---------------------------------------------------------------------------


async def test_without_stealth_the_extra_masking_is_off(recorder: type[_Recorder]) -> None:
    await render(RenderRequest(url="https://example.com/"))
    opened = recorder.opened[0]
    assert opened["solve_cloudflare"] is False
    assert opened["hide_canvas"] is False
    assert opened["google_search"] is False


async def test_webrtc_cannot_go_around_the_guard(recorder: type[_Recorder]) -> None:
    # WebRTC sends STUN over UDP, which no HTTP proxy carries: without the lock a page
    # reaches loopback and LAN addresses the guard never sees.
    await render(RenderRequest(url="https://example.com/"))
    assert recorder.opened[0]["block_webrtc"] is True


async def test_webrtc_cannot_leak_the_real_address_behind_a_caller_proxy(
    recorder: type[_Recorder],
) -> None:
    await render(RenderRequest(url="https://example.com/", proxy="http://proxy.example:8080"))
    assert recorder.opened[0]["block_webrtc"] is True


async def test_webrtc_is_left_alone_with_no_guard_and_no_proxy(recorder: type[_Recorder]) -> None:
    await render(RenderRequest(url="http://127.0.0.1:9/", allow_private=True))
    assert recorder.opened[0]["block_webrtc"] is False


async def test_stealth_turns_on_the_extra_masking_but_not_the_solver(
    recorder: type[_Recorder],
) -> None:
    await render(RenderRequest(url="https://example.com/", stealth=True))
    opened = recorder.opened[0]
    assert opened["hide_canvas"] is True
    assert opened["block_webrtc"] is True
    assert opened["google_search"] is True
    assert opened["solve_cloudflare"] is False


async def test_the_solver_runs_only_when_asked(recorder: type[_Recorder]) -> None:
    await render(RenderRequest(url="https://example.com/", solve_cloudflare=True))
    assert recorder.opened[0]["solve_cloudflare"] is True


async def test_wait_and_resource_options_reach_the_browser(recorder: type[_Recorder]) -> None:
    await render(
        RenderRequest(
            url="https://example.com/",
            wait_ms=750,
            wait_selector="#app li",
            network_idle=True,
            block_ads=True,
            disable_resources=True,
            headers={"Accept-Language": "de-DE"},
            timeout_ms=12_000,
        )
    )
    opened = recorder.opened[0]
    assert opened["wait"] == 750
    assert opened["wait_selector"] == "#app li"
    assert opened["network_idle"] is True
    assert opened["block_ads"] is True
    assert opened["disable_resources"] is True
    assert opened["extra_headers"] == {"Accept-Language": "de-DE"}
    assert opened["timeout"] <= 12_000


async def test_cookies_go_in_and_come_back_out(recorder: type[_Recorder]) -> None:
    recorder.page = _Page(
        cookies=({"name": "cf_clearance", "value": "abc", "domain": ".example.com", "path": "/"},)
    )
    result = await render(
        RenderRequest(
            url="https://example.com/",
            cookies=[{"name": "session", "value": "s1"}],
        )
    )
    sent = recorder.opened[0]["cookies"]
    assert sent == [{"name": "session", "value": "s1", "url": "https://example.com/"}]
    assert result.cookies[0]["name"] == "cf_clearance"


async def test_a_rendered_page_comes_back_in_the_fetch_shape(recorder: type[_Recorder]) -> None:
    result = await render(RenderRequest(url="https://example.com/"))
    assert result.success
    assert result.status == 200
    assert result.body == "<html><body>rendered</body></html>"
    assert result.final_url == "https://example.com/"
    assert result.headers["content-type"] == "text/html"


async def test_headers_come_from_the_page_that_was_returned(recorder: type[_Recorder]) -> None:
    # Scrapling reports the first response's headers with the last one's status: after a
    # solved challenge that pairs the 403's cf-mitigated header with a 200, which the API
    # then reads as a challenge.
    recorder.page = _Page(headers={"cf-mitigated": "challenge", "content-type": "text/html"})
    recorder.documents = [
        {"cf-mitigated": "challenge", "content-type": "text/html"},
        {"content-type": "text/html; charset=utf-8", "etag": "abc"},
    ]
    result = await render(RenderRequest(url="https://example.com/", solve_cloudflare=True))
    assert "cf-mitigated" not in result.headers
    assert result.headers["etag"] == "abc"


# --- a caller's profile ----------------------------------------------------------------


def _profile() -> RenderIdentity:
    return RenderIdentity(
        id="chrome-137",
        user_agent="UA-137",
        accept_language="en-GB,en;q=0.9",
        timezone="Europe/London",
        init_script="window.__helix = 1;",
    )


async def test_a_profile_identity_reaches_the_browser_and_is_reported(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    presented: list[str] = []

    async def present(page: object, identity: RenderIdentity) -> object:
        presented.append(identity.id)
        return object()

    monkeypatch.setattr(render_module, "present", present)
    result = await render(RenderRequest(url="https://example.com/", identity=_profile()))
    assert result.success
    assert result.profile_used == "chrome-137"
    assert presented == ["chrome-137"]
    options = recorder.opened[0]
    assert options["useragent"] == "UA-137"
    assert options["locale"] == "en-GB"
    assert options["timezone_id"] == "Europe/London"


async def test_without_a_profile_no_identity_is_claimed(recorder: type[_Recorder]) -> None:
    result = await render(RenderRequest(url="https://example.com/"))
    assert result.profile_used is None
    assert "useragent" not in recorder.opened[0]


async def test_a_profile_that_could_not_be_presented_is_not_reported(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def present(page: object, identity: RenderIdentity) -> object:
        raise RuntimeError("no CDP session")

    monkeypatch.setattr(render_module, "present", present)
    result = await render(RenderRequest(url="https://example.com/", identity=_profile()))
    assert result.profile_used is None


# --- browser slots ---------------------------------------------------------------------


def test_a_closed_loops_browser_gate_is_freed(monkeypatch: pytest.MonkeyPatch) -> None:
    import gc
    import weakref

    monkeypatch.setenv("HELIX_SCRAPE_MAX_RENDERS", "1")

    async def gate() -> asyncio.Semaphore:
        # A wait binds the semaphore to its loop (`_loop`), the reference that kept it alive.
        slots = render_module._slot_gate()
        await slots.acquire()
        waiter = asyncio.ensure_future(slots.acquire())
        await asyncio.sleep(0)
        slots.release()
        await waiter
        slots.release()
        return slots

    gates = []
    for _ in range(3):
        loop = asyncio.new_event_loop()
        gates.append(weakref.ref(loop.run_until_complete(gate())))
        loop.close()
    del loop
    gc.collect()
    assert [g() for g in gates] == [None, None, None]


async def test_renders_waiting_for_a_browser_hold_no_worker_thread(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    # /fetch resolves names on the default executor (loop.getaddrinfo); renders queued for a
    # browser must not use up its threads while they wait.
    monkeypatch.setenv("HELIX_SCRAPE_MAX_RENDERS", "2")
    loop = asyncio.get_running_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=3))
    recorder.delay_s = 1.0
    renders = [
        asyncio.create_task(render(RenderRequest(url="https://example.com/"))) for _ in range(4)
    ]
    await asyncio.sleep(0.2)
    try:
        assert await asyncio.wait_for(asyncio.to_thread(lambda: "resolved"), 0.5) == "resolved"
    finally:
        await asyncio.gather(*renders)


async def test_no_more_browsers_run_than_the_cap(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HELIX_SCRAPE_MAX_RENDERS", "2")
    recorder.delay_s = 0.3
    results = await asyncio.gather(
        *(render(RenderRequest(url="https://example.com/")) for _ in range(5))
    )
    assert all(r.success for r in results)
    assert recorder.peak == 2


async def test_a_render_that_never_gets_a_browser_times_out(
    recorder: type[_Recorder], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HELIX_SCRAPE_MAX_RENDERS", "2")
    recorder.delay_s = 2.0
    busy = [
        asyncio.create_task(render(RenderRequest(url="https://example.com/"))) for _ in range(2)
    ]
    await asyncio.sleep(0.2)
    result = await render(RenderRequest(url="https://example.com/", timeout_ms=300))
    await asyncio.gather(*busy)
    assert result.error == "timeout after 300ms (waiting for a free browser)"


# --- deadline and errors ---------------------------------------------------------------


async def test_the_deadline_is_hard_even_while_the_solver_runs(recorder: type[_Recorder]) -> None:
    recorder.delay_s = 10
    started = time.monotonic()
    result = await render(
        RenderRequest(url="https://example.com/", solve_cloudflare=True, timeout_ms=1_000)
    )
    assert time.monotonic() - started < 4
    assert not result.success
    assert result.error is not None
    assert result.error.startswith("timeout after 1000ms")
    assert "challenge" in result.error


@pytest.mark.parametrize(
    ("raised", "expected"),
    [
        ("Page.goto: Timeout 30000ms exceeded.\nCall log:", "timeout after 30000ms"),
        ("Page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.invalid/", "connection failed: dns"),
        ("Page.goto: net::ERR_SSL_PROTOCOL_ERROR at https://x/", "connection failed: net::ERR_SSL"),
    ],
)
async def test_browser_errors_keep_the_prefixes_the_api_classifies(
    recorder: type[_Recorder], raised: str, expected: str
) -> None:
    recorder.error = RuntimeError(raised)
    result = await render(RenderRequest(url="https://example.com/"))
    assert result.error is not None
    assert result.error.startswith(expected)


async def test_error_text_never_trips_the_services_down_classifier(
    recorder: type[_Recorder],
) -> None:
    recorder.error = RuntimeError("Page.goto: net::ERR_ADDRESS_UNREACHABLE (service fetch failed)")
    result = await render(RenderRequest(url="https://example.com/"))
    text = (result.error or "").lower()
    assert result.error and not any(w in text for w in ("unreachable", "service", "fetch failed"))


# --- finding Chromium ------------------------------------------------------------------


def test_the_newest_staged_chromium_is_used(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    for rev in ("1234", "1248", "999"):
        exe = tmp_path / f"chromium-{rev}" / "chrome-win64" / "chrome.exe"
        exe.parent.mkdir(parents=True)
        exe.write_bytes(b"")
    (tmp_path / "chromium_headless_shell-2000").mkdir()
    monkeypatch.delenv("HELIX_CHROMIUM_PATH", raising=False)
    monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", str(tmp_path))
    found = chromium_path()
    assert found is not None
    assert Path(found).parts[-3] == "chromium-1248"


def test_an_explicit_chromium_path_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HELIX_CHROMIUM_PATH", "C:/chrome/chrome.exe")
    assert chromium_path() == "C:/chrome/chrome.exe"


# --- the real browser ------------------------------------------------------------------

browser = pytest.mark.skipif(chromium_path() is None, reason="no staged Chromium")


class _Site(http.server.BaseHTTPRequestHandler):
    hits: ClassVar[list[str]] = []
    target = ""

    def log_message(self, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        _Site.hits.append(self.path)
        if self.path == "/hop":
            self.send_response(302)
            self.send_header("location", _Site.target)
            self.end_headers()
            return
        body = (
            b"<html><body><div id=app></div><script>"
            b"document.getElementById('app').textContent='made by script'</script></body></html>"
        )
        self.send_response(200)
        self.send_header("content-type", "text/html")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def site() -> Iterator[int]:
    _Site.hits = []
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Site)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()


@browser
async def test_browser_a_redirect_to_a_private_address_is_never_requested(
    site: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    # public.test stands in for a public host that answers with a 302 to localhost.
    async def lookup(host: str, port: int) -> list[str]:
        if host == "public.test":
            return ["127.0.0.1"]
        raise ValueError("private or local address")

    monkeypatch.setattr(render_module, "LOOKUP", lookup)
    _Site.target = f"http://localhost:{site}/secret"
    result = await render(RenderRequest(url=f"http://public.test:{site}/hop", timeout_ms=20_000))
    assert not result.success
    assert result.error == "request failed: redirected to a private or local address"
    assert "/secret" not in _Site.hits


@browser
async def test_browser_renders_what_the_script_builds(site: int) -> None:
    result = await render(
        RenderRequest(url=f"http://127.0.0.1:{site}/page", allow_private=True, timeout_ms=20_000)
    )
    assert result.success, result.error
    assert result.body is not None and "made by script" in result.body


class _Probe(http.server.BaseHTTPRequestHandler):
    seen: ClassVar[dict[str, str]] = {}

    def log_message(self, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        _Probe.seen = {k.lower(): v for k, v in self.headers.items()}
        body = (
            b"<html><body><pre id=out></pre><script>"
            b"const d = navigator.userAgentData;"
            b"document.getElementById('out').textContent = JSON.stringify({"
            b"ua: navigator.userAgent,"
            b"brands: d ? d.brands.map(b => b.brand + '/' + b.version) : null,"
            b"tz: Intl.DateTimeFormat().resolvedOptions().timeZone, screen: screen.width,"
            b"marker: window.__helix || null});"
            b"</script></body></html>"
        )
        self.send_response(200)
        self.send_header("content-type", "text/html")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@browser
async def test_browser_presents_the_profile_to_the_server_and_the_page() -> None:
    import json
    import re

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Probe)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    ua = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
    )
    try:
        result = await render(
            RenderRequest(
                url=f"http://127.0.0.1:{server.server_address[1]}/probe",
                allow_private=True,
                timeout_ms=20_000,
                identity=RenderIdentity(
                    id="chrome-137",
                    user_agent=ua,
                    accept_language="en-GB,en-US;q=0.9,en;q=0.8",
                    timezone="Europe/London",
                    screen=Screen(width=1728, height=1117),
                    init_script="window.__helix = 'set';",
                ),
            )
        )
    finally:
        server.shutdown()
    assert result.success, result.error
    assert result.profile_used == "chrome-137"
    sent = _Probe.seen
    assert sent["user-agent"] == ua
    assert sent["accept-language"] == "en-GB,en-US;q=0.9,en;q=0.8"
    assert 'v="137"' in sent["sec-ch-ua"]
    assert sent["sec-ch-ua-platform"] == '"macOS"'
    match = re.search(r"<pre id=\"?out\"?>(.*?)</pre>", result.body or "", re.S)
    assert match, (result.body or "")[:300]
    page = json.loads(match.group(1).replace("&quot;", '"'))
    assert page["ua"] == ua
    assert all(b.endswith("/137") or b.startswith("Not") for b in page["brands"])
    assert page["tz"] == "Europe/London"
    assert page["screen"] == 1728
    assert page["marker"] == "set"
