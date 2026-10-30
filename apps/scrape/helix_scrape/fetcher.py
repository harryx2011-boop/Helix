"""The fetch tier: tier 0 (plain) and tier 1 (TLS-impersonating) of the escalation ladder.

This service reports what happened at the transport layer and applies no policy of its
own; block classification lives in the API (core/block-detection.ts). Error text is part of
that contract: the API matches substrings, and checks "service", "unreachable" and
"fetch failed" first, so none of those words may appear in a message here.

Redirects are followed by hand so each hop can be checked and its host pinned to the
addresses that were checked (the connection goes to those, so a second lookup cannot swap a
private address in).
"""

from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
import time
from dataclasses import dataclass
from urllib.parse import SplitResult, urljoin, urlsplit

from curl_cffi.const import CurlOpt
from curl_cffi.requests import AsyncSession
from curl_cffi.requests import exceptions as curl_errors

from helix_scrape.guard import is_private_host, public_only
from helix_scrape.models import FetchRequest, FetchResponse
from helix_scrape.profiles import resolve, windows_headers

MAX_HOPS = 10
DEFAULT_MAX_BODY = 10 * 1024 * 1024
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_CURL_HELP = " See https://curl.se"


class Refused(Exception):  # noqa: N818 - a refusal, not an error
    """A redirect this instance will not follow."""


def max_body_bytes() -> int:
    """Read per request so a test or an operator can change it without a restart."""
    try:
        return int(os.environ["HELIX_FETCH_MAX_BODY_BYTES"])
    except (KeyError, ValueError):
        return DEFAULT_MAX_BODY


def next_hop(current: str, location: str, hops_done: int, allow_private: bool) -> str:
    """The URL a redirect points at, or Refused. `hops_done` counts redirects already taken."""
    target = urljoin(current, location)
    if not allow_private and is_private_host(urlsplit(target).hostname):
        raise Refused("redirected to a private or local address")
    if hops_done >= MAX_HOPS:
        raise Refused("too many redirects")
    return target


def _parse(url: str) -> SplitResult:
    """A usable http(s) URL, or ValueError with the reason."""
    parts = urlsplit(url)
    _ = parts.port  # raises ValueError on a bad port
    if not parts.scheme:
        raise ValueError("relative URL without a base")
    if parts.scheme not in ("http", "https"):
        raise ValueError(f"unsupported scheme {parts.scheme!r}")
    if not parts.hostname:
        raise ValueError("empty host")
    return parts


def _is_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


async def _pin(parts: SplitResult, req: FetchRequest) -> dict[int, list[str]] | None:
    """curl options that send this host to the addresses just checked.

    None when nothing needs pinning: private hosts are allowed, a proxy resolves the target
    (the proxy host itself was checked by the API), or the host is already an address.
    """
    host = parts.hostname or ""
    if req.allow_private or req.proxy or _is_literal(host):
        return None
    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        found = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise ConnectionError(f"dns error: {error}") from error
    addresses = list(dict.fromkeys(str(info[4][0]) for info in found))
    try:
        public_only(addresses)
    except ValueError as error:
        raise ConnectionError(str(error)) from error
    return {CurlOpt.RESOLVE: [f"{host}:{port}:{','.join(addresses)}"]}


def _request_headers(req: FetchRequest, target: str | None) -> dict[str, str]:
    """Windows identity headers for Chrome, then the caller's, which win (their call to make)."""
    merged: dict[str, tuple[str, str]] = {}
    sources = [windows_headers(target) if target else {}, req.headers or {}]
    for source in sources:
        for name, value in source.items():
            merged[name.lower()] = (name, value)
    return dict(merged.values())


@dataclass
class _Hop:
    status: int
    headers: dict[str, str]
    set_cookies: list[str]
    location: str | None = None
    body: str | None = None
    error: str | None = None


def _describe(error: Exception, timeout_ms: int) -> str:
    """The failure text the API classifies by substring."""
    text = str(error).split(_CURL_HELP)[0].strip()
    if isinstance(error, curl_errors.Timeout):
        return f"timeout after {timeout_ms}ms"
    if isinstance(error, curl_errors.DNSError):
        return f"connection failed: dns error: {text}"
    if isinstance(error, ConnectionError | curl_errors.ConnectionError):
        return f"connection failed: {text}"
    return f"request failed: {text}"


async def _read_body(response: object, cap: int) -> tuple[str | None, str | None]:
    """The decoded body, capped. The cap counts decoded bytes, so a compression bomb stops."""
    chunks = bytearray()
    async for chunk in response.aiter_content():  # type: ignore[attr-defined]
        chunks.extend(chunk)
        if len(chunks) > cap:
            return None, f"body exceeds {cap} bytes"
    return chunks.decode("utf-8", errors="replace"), None


async def _hop(
    url: str, parts: SplitResult, req: FetchRequest, target: str | None, remaining_s: float
) -> _Hop:
    options = await _pin(parts, req)
    session_args: dict[str, object] = {}
    if target:
        session_args["impersonate"] = target
    if req.proxy:
        session_args["proxy"] = req.proxy
    if options:
        session_args["curl_options"] = options
    async with AsyncSession(**session_args) as session:  # type: ignore[arg-type]
        response = await session.get(
            url,
            headers=_request_headers(req, target),
            timeout=remaining_s,
            allow_redirects=False,
            stream=True,
        )
        headers = {k.lower(): v for k, v in response.headers.items()}
        hop = _Hop(
            status=response.status_code,
            headers=headers,
            set_cookies=list(response.headers.get_list("set-cookie")),
        )
        location = headers.get("location")
        if response.status_code in REDIRECT_STATUSES and location:
            hop.location = location
            return hop
        hop.body, hop.error = await _read_body(response, max_body_bytes())
        return hop


async def fetch(req: FetchRequest) -> FetchResponse:
    started = time.monotonic()

    def elapsed() -> int:
        return int((time.monotonic() - started) * 1000)

    try:
        parts = _parse(req.url)
    except ValueError as error:
        return FetchResponse.failure(f"invalid url: {error}", elapsed())
    if not req.allow_private and is_private_host(parts.hostname):
        return FetchResponse.failure(
            "private or local address, which this instance does not fetch", elapsed()
        )

    target = resolve(req.profile).target if req.impersonate else None
    url, hops = req.url, 0
    while True:
        remaining = req.timeout_ms - elapsed()
        if remaining <= 0:
            return FetchResponse.failure(f"timeout after {req.timeout_ms}ms", elapsed())
        try:
            hop = await _hop(url, parts, req, target, remaining / 1000)
        except Exception as error:
            return FetchResponse.failure(_describe(error, req.timeout_ms), elapsed())
        if hop.location is None:
            break
        try:
            url = next_hop(url, hop.location, hops, req.allow_private)
            parts = _parse(url)
        except (Refused, ValueError) as error:
            return FetchResponse.failure(f"request failed: {error}", elapsed())
        hops += 1

    return FetchResponse(
        success=hop.error is None,
        status=hop.status,
        headers=hop.headers,
        set_cookies=hop.set_cookies,
        body=hop.body,
        profile_used=target,
        final_url=url,
        timing_ms=elapsed(),
        error=hop.error,
    )
