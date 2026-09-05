from __future__ import annotations

import asyncio
import json
import random
from collections.abc import Awaitable, Iterable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from .config import Settings

Params = dict[str, Any] | None

_IDEMPOTENT_METHODS = frozenset({"GET", "HEAD"})
_RETRYABLE_STATUSES = frozenset({429, 502, 503, 504})
_RETRYABLE_EXC = (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError)
_MAX_ATTEMPTS = 3
_BACKOFF_BASE = 0.5
_BACKOFF_CAP = 8.0
_RETRY_AFTER_CAP = 30.0


def _is_retryable(method: str, *, status: int | None = None, exc: Exception | None = None) -> bool:
    """A write that may have partially succeeded must surface its error, not re-fire."""
    if method.upper() not in _IDEMPOTENT_METHODS:
        return False
    if status is not None:
        return status in _RETRYABLE_STATUSES
    if exc is not None:
        return isinstance(exc, _RETRYABLE_EXC)
    return False


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    raw = raw.strip()
    if raw.isdigit():
        return float(raw)
    try:
        when = parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return max(0.0, (when - datetime.now(UTC)).total_seconds())


def _backoff_delay(attempt: int) -> float:
    exponential = min(_BACKOFF_CAP, _BACKOFF_BASE * (2**attempt))
    return random.uniform(0, exponential)


class CanvasError(Exception):
    def __init__(self, status: int, message: str, hint: str | None = None):
        self.status = status
        self.message = message
        self.hint = hint
        super().__init__(message)

    def __str__(self) -> str:
        if self.status:
            text = f"Canvas returned {self.status}: {self.message}"
        else:
            text = f"Canvas request failed: {self.message}"
        return f"{text}\nHint: {self.hint}" if self.hint else text


def _hint(status: int, message: str, host: str) -> str | None:
    lowered = message.lower()
    if status == 401:
        return (
            "The token was rejected. Generate a new one in Canvas under "
            "Account > Settings > Approved Integrations, then update CANVAS_TOKEN."
        )
    if status == 403:
        if "rate limit" in lowered:
            return "Canvas rate limit hit. Wait a minute, then retry with lower CANVAS_MAX_CONCURRENCY."
        return "Your Canvas role does not permit this action."
    if status == 404:
        if "domain" in lowered:
            return f"CANVAS_URL points at the wrong host ({host}). Use your school's Canvas address."
        return "Nothing at that path. Check the course, assignment, or item id."
    if status in (301, 302, 303, 307, 308):
        return "Canvas redirected instead of answering. Check that CANVAS_URL is your school's Canvas host."
    if status >= 500:
        return "Canvas server error. Retry shortly."
    return None


def _extract_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.reason_phrase or response.text[:200] or "unknown error"
    if isinstance(body, dict):
        errors = body.get("errors")
        if isinstance(errors, list) and errors:
            first = errors[0]
            return first.get("message", str(first)) if isinstance(first, dict) else str(first)
        if isinstance(errors, dict):
            for messages in errors.values():
                if isinstance(messages, list) and messages:
                    first = messages[0]
                    return first.get("message", str(first)) if isinstance(first, dict) else str(first)
        for key in ("message", "error", "error_description"):
            if body.get(key):
                return str(body[key])
    return response.reason_phrase or "unknown error"


def parse_json(response: httpx.Response) -> Any:
    if not response.content:
        return None
    text = response.text
    if text.startswith("while(1);"):
        text = text[len("while(1);") :]
    return json.loads(text)


class PageList(list):
    """A list of items from get_all(), plus whether the page limit cut it off.

    Still a plain list everywhere it's indexed, sliced, sorted, or measured
    with len() — .capped is the one thing get_all() couldn't otherwise tell
    a caller, and callers that don't check it lose nothing they had before.
    """

    def __init__(self, items: Iterable[Any], capped: bool):
        super().__init__(items)
        self.capped = capped


class CanvasClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._http = httpx.AsyncClient(
            base_url=f"{settings.base_url}/api/v1",
            headers={
                "Authorization": f"Bearer {settings.token}",
                "Accept": "application/json",
                "User-Agent": "canvaslms-api",
            },
            timeout=settings.timeout,
            follow_redirects=False,
        )
        self._semaphore = asyncio.Semaphore(settings.max_concurrency)

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: Params = None,
        json: Any = None,
        data: Any = None,
        files: Any = None,
        timeout: float | None = None,
    ) -> httpx.Response:
        attempt = 0
        while True:
            try:
                async with self._semaphore:
                    response = await self._http.request(
                        method,
                        path,
                        params=params,
                        json=json,
                        data=data,
                        files=files,
                        timeout=timeout if timeout is not None else httpx.USE_CLIENT_DEFAULT,
                    )
            except _RETRYABLE_EXC as exc:
                if _is_retryable(method, exc=exc) and attempt < _MAX_ATTEMPTS - 1:
                    await asyncio.sleep(_backoff_delay(attempt))
                    attempt += 1
                    continue
                raise CanvasError(
                    0,
                    f"{type(exc).__name__}: {exc}",
                    "Check CANVAS_URL and your network connection.",
                ) from exc
            except httpx.HTTPError as exc:
                raise CanvasError(
                    0,
                    f"{type(exc).__name__}: {exc}",
                    "Check CANVAS_URL and your network connection.",
                ) from exc
            rate_limited = method.upper() in _IDEMPOTENT_METHODS and (
                response.status_code == 429
                or (response.status_code == 403 and "rate limit" in response.text.lower())
            )
            retryable = rate_limited or _is_retryable(method, status=response.status_code)
            if retryable and attempt < _MAX_ATTEMPTS - 1:
                delay = _retry_after_seconds(response) if response.status_code in (429, 503) else None
                if delay is None:
                    delay = _backoff_delay(attempt)
                else:
                    delay = min(delay, _RETRY_AFTER_CAP)
                await asyncio.sleep(delay)
                attempt += 1
                continue
            if response.status_code >= 300:
                message = _extract_message(response)
                raise CanvasError(
                    response.status_code,
                    message,
                    _hint(response.status_code, message, self.settings.host),
                )
            return response

    async def get(self, path: str, params: Params = None) -> Any:
        return parse_json(await self.request("GET", path, params=params))

    async def get_all(
        self, path: str, params: Params = None, limit: int = 1000, *, timeout: float | None = None
    ) -> PageList:
        merged: dict[str, Any] = {"per_page": 100}
        merged.update(params or {})
        items: list[Any] = []
        response = await self.request("GET", path, params=merged, timeout=timeout)
        while True:
            page = parse_json(response)
            if not isinstance(page, list):
                return PageList([page] if page is not None else [], capped=False)
            items.extend(page)
            next_url = response.links.get("next", {}).get("url")
            if not next_url:
                return PageList(items, capped=False)
            if len(items) >= limit:
                return PageList(items[:limit], capped=True)
            response = await self.request("GET", next_url, timeout=timeout)

    async def post(
        self,
        path: str,
        *,
        json: Any = None,
        data: Any = None,
        files: Any = None,
        params: Params = None,
        timeout: float | None = None,
    ) -> Any:
        return parse_json(
            await self.request(
                "POST", path, json=json, data=data, files=files, params=params, timeout=timeout
            )
        )

    async def put(
        self, path: str, *, json: Any = None, params: Params = None, timeout: float | None = None
    ) -> Any:
        return parse_json(await self.request("PUT", path, json=json, params=params, timeout=timeout))

    async def delete(self, path: str, *, params: Params = None, json: Any = None) -> Any:
        return parse_json(await self.request("DELETE", path, params=params, json=json))

    async def download(self, url: str, *, timeout: float | None = None) -> httpx.Response:
        effective_timeout = timeout if timeout is not None else self.settings.timeout
        try:
            response = await self._http.get(
                url, timeout=timeout if timeout is not None else httpx.USE_CLIENT_DEFAULT
            )
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("location", "")
                async with httpx.AsyncClient(
                    follow_redirects=True, timeout=effective_timeout
                ) as anonymous:
                    response = await anonymous.get(location)
        except httpx.HTTPError as exc:
            raise CanvasError(0, f"{type(exc).__name__}: {exc}") from exc
        if response.status_code >= 300:
            raise CanvasError(response.status_code, f"download failed for {url}")
        return response

    async def gather(self, awaitables: Iterable[Awaitable[Any]]) -> list[Any]:
        return list(await asyncio.gather(*awaitables, return_exceptions=True))

    async def aclose(self) -> None:
        await self._http.aclose()
