"""A local HTTP server the fetch tests talk to (loopback, so every test sets allow_private)."""

from __future__ import annotations

import gzip
import http.server
import threading
from collections.abc import Iterator

import pytest

BIG_BODY = 2 * 1024 * 1024


class _Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args: object) -> None:  # silence the test output
        pass

    def _send(
        self, body: bytes, status: int = 200, extra: list[tuple[str, str]] | None = None
    ) -> None:
        self.send_response(status)
        for name, value in extra or []:
            self.send_header(name, value)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        head = f"{self.requestline}\r\n{self.headers.as_string()}".lower()
        path = self.path
        if path == "/gzip" and "gzip" in self.headers.get("accept-encoding", "").lower():
            self._send(gzip.compress(b"compressed hello"), extra=[("content-encoding", "gzip")])
        elif path == "/gzip":
            self._send(b"not compressed")
        elif path == "/big":
            self._send(b"x" * BIG_BODY)
        elif path == "/cookies":
            self._send(b"ok", extra=[("set-cookie", "a=1; Path=/"), ("set-cookie", "b=2; Path=/")])
        elif path.startswith("/redirect/"):
            left = int(path.rsplit("/", 1)[1])
            target = "/echo" if left <= 1 else f"/redirect/{left - 1}"
            self._send(b"", status=302, extra=[("location", target)])
        elif path == "/loop":
            self._send(b"", status=302, extra=[("location", "/loop")])
        elif path == "/slow":
            threading.Event().wait(2)
            self._send(b"late")
        else:  # /echo and anything else: the request head, lowercased
            self._send(head.encode())


@pytest.fixture(scope="session")
def base_url() -> Iterator[str]:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
