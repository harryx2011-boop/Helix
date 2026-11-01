"""The private-address guard for the browser: a loopback proxy every browser connection uses.

A page route cannot enforce the guard: Chromium follows a redirect without showing the new
hop to the route (measured on scrapling 0.5 / patchright 1.64: a 302 to localhost was
followed and served while the route saw only the first URL). A proxy sees every connection,
the redirect hops, subresources, workers and WebSockets included, and the browser does no
DNS of its own for proxied requests. So each host is resolved here once, refused when any
answer is private, and the connection goes to exactly the addresses that were checked; the
same rule `/fetch` applies per hop.

The browser must be launched with `--proxy-bypass-list=<-loopback>` (Playwright adds it when
a proxy is set), or Chromium would send loopback URLs around the proxy.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from types import TracebackType
from urllib.parse import urlsplit

from helix_scrape.guard import is_private_host, lookup_public

Lookup = Callable[[str, int], Awaitable[list[str]]]

_MAX_HEAD = 64 * 1024
_CONNECT_TIMEOUT_S = 10


class GuardProxy:
    """`async with GuardProxy() as proxy:` serves on `proxy.url` until the block ends."""

    def __init__(self, lookup: Lookup = lookup_public) -> None:
        self._lookup = lookup
        self._server: asyncio.Server | None = None
        self._tasks: set[asyncio.Task[None]] = set()
        # host:port of every refused connection, so a failed render can say why.
        self.refused: list[str] = []
        # host:port of every name that did not resolve.
        self.unresolved: list[str] = []
        self.url = ""

    async def __aenter__(self) -> GuardProxy:
        self._server = await asyncio.start_server(self._serve, "127.0.0.1", 0)
        port = self._server.sockets[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        if self._server is not None:
            self._server.close()
        for task in list(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _serve(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        if task is not None:
            self._tasks.add(task)
        try:
            await self._handle(reader, writer)
        except (OSError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            pass
        finally:
            if task is not None:
                self._tasks.discard(task)
            writer.close()

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        head = await reader.readuntil(b"\r\n\r\n")
        if len(head) > _MAX_HEAD:
            return await _reply(writer, 400, "request head too large")
        first, _, rest = head.partition(b"\r\n")
        try:
            method, target, version = first.decode("latin-1").split(" ")
            if method == "CONNECT":
                host, port = _split_authority(target)
                forward = b""
            else:
                parts = urlsplit(target)
                if parts.scheme != "http" or not parts.hostname:
                    raise ValueError("absolute http URL expected")
                host = parts.hostname
                port = parts.port or 80
                path = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
                forward = f"{method} {path} {version}\r\n".encode("latin-1") + _one_shot(rest)
        except ValueError:
            return await _reply(writer, 400, "malformed proxy request")

        try:
            if is_private_host(host):
                raise ValueError("private or local address")
            addresses = await self._lookup(host, port)
        except ValueError:
            self.refused.append(f"{host}:{port}")
            return await _reply(writer, 403, "private or local address, not fetched")
        except ConnectionError:
            self.unresolved.append(f"{host}:{port}")
            return await _reply(writer, 502, "name did not resolve")

        upstream = await _open(addresses, port)
        if upstream is None:
            return await _reply(writer, 502, "connection failed")
        up_reader, up_writer = upstream
        if method == "CONNECT":
            writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await writer.drain()
        else:
            up_writer.write(forward)
        try:
            await asyncio.gather(_pipe(reader, up_writer), _pipe(up_reader, writer))
        finally:
            up_writer.close()


def _one_shot(headers: bytes) -> bytes:
    """The header block, ending the exchange after one response.

    The browser reuses a proxy connection for plain-HTTP requests to other hosts, but this
    one is piped to the host that was checked, so the next request must come back through
    the check on a new connection.
    """
    kept = [
        line
        for line in headers.split(b"\r\n")
        if line and not line.lower().startswith((b"connection:", b"proxy-connection:"))
    ]
    return b"\r\n".join([*kept, b"Connection: close", b"", b""])


def _split_authority(authority: str) -> tuple[str, int]:
    host, sep, port = authority.rpartition(":")
    if not sep or not host or not port.isdigit():
        raise ValueError("host:port expected")
    return host.strip("[]"), int(port)


async def _open(
    addresses: list[str], port: int
) -> tuple[asyncio.StreamReader, asyncio.StreamWriter] | None:
    for address in addresses:
        with contextlib.suppress(OSError, TimeoutError):
            return await asyncio.wait_for(
                asyncio.open_connection(address, port), _CONNECT_TIMEOUT_S
            )
    return None


async def _pipe(source: asyncio.StreamReader, sink: asyncio.StreamWriter) -> None:
    try:
        while chunk := await source.read(65536):
            sink.write(chunk)
            await sink.drain()
    except OSError:
        pass
    finally:
        with contextlib.suppress(OSError):
            sink.write_eof()


async def _reply(writer: asyncio.StreamWriter, status: int, reason: str) -> None:
    body = reason.encode()
    writer.write(
        f"HTTP/1.1 {status} {reason}\r\ncontent-length: {len(body)}\r\n"
        f"connection: close\r\n\r\n".encode()
        + body
    )
    await writer.drain()
