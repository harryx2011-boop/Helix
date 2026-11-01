"""The browser's private-address guard: a local proxy every browser connection goes through.

A page route cannot see redirect hops (measured: Chromium followed a 302 to localhost and
the route handler saw only the first URL), so the browser is pointed at this proxy, which
resolves each host once, refuses any private answer and connects to the checked addresses.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urlsplit

import pytest

from helix_scrape.guard import lookup_public, public_only
from helix_scrape.guard_proxy import GuardProxy


async def _exchange(proxy_url: str, request: bytes) -> bytes:
    parts = urlsplit(proxy_url)
    reader, writer = await asyncio.open_connection(parts.hostname, parts.port)
    writer.write(request)
    await writer.drain()
    reply = await asyncio.wait_for(reader.read(), 5)  # to EOF: a reply can arrive in parts
    writer.close()
    return reply


def _port(base_url: str) -> int:
    port = urlsplit(base_url).port
    assert port is not None
    return port


async def test_connect_to_a_private_address_is_refused(base_url: str) -> None:
    port = _port(base_url)
    async with GuardProxy() as proxy:
        reply = await _exchange(proxy.url, f"CONNECT 127.0.0.1:{port} HTTP/1.1\r\n\r\n".encode())
    assert reply.startswith(b"HTTP/1.1 403")
    assert proxy.refused == [f"127.0.0.1:{port}"]


async def test_a_name_that_is_local_by_definition_is_refused(base_url: str) -> None:
    port = _port(base_url)
    async with GuardProxy() as proxy:
        reply = await _exchange(proxy.url, f"CONNECT localhost:{port} HTTP/1.1\r\n\r\n".encode())
    assert reply.startswith(b"HTTP/1.1 403")


async def test_a_name_whose_lookup_fails_the_check_is_refused(base_url: str) -> None:
    port = _port(base_url)

    async def lookup(host: str, port: int) -> list[str]:
        return public_only(["10.0.0.7"])  # what lookup_public does with a private answer

    async with GuardProxy(lookup=lookup) as proxy:
        reply = await _exchange(proxy.url, f"CONNECT rebind.test:{port} HTTP/1.1\r\n\r\n".encode())
    assert reply.startswith(b"HTTP/1.1 403")
    assert proxy.refused == [f"rebind.test:{port}"]


async def test_lookup_public_refuses_a_name_with_any_private_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake(host: str, port: int, **_: object) -> list[tuple[object, ...]]:
        return [(0, 0, 0, "", ("93.184.215.14", port)), (0, 0, 0, "", ("192.168.1.2", port))]

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", fake)
    with pytest.raises(ValueError, match="private"):
        await lookup_public("mixed.test", 443)


async def test_a_plain_http_request_to_a_private_address_is_refused(base_url: str) -> None:
    async with GuardProxy() as proxy:
        reply = await _exchange(
            proxy.url, f"GET {base_url}/echo HTTP/1.1\r\nHost: x\r\n\r\n".encode()
        )
    assert reply.startswith(b"HTTP/1.1 403")
    assert b"internal" not in reply


async def test_a_public_answer_is_connected_to_the_checked_address(base_url: str) -> None:
    port = _port(base_url)
    asked: list[str] = []

    # Stands in for a public answer: the guard connects to what the lookup returned,
    # never to a second resolution of the name.
    async def lookup(host: str, port: int) -> list[str]:
        asked.append(host)
        return ["127.0.0.1"]

    async with GuardProxy(lookup=lookup) as proxy:
        reply = await _exchange(
            proxy.url,
            f"GET http://public.test:{port}/echo HTTP/1.1\r\n"
            "Host: public.test\r\nConnection: close\r\n\r\n".encode(),
        )
    assert reply.startswith(b"HTTP/1.1 200")
    assert b"get /echo http/1.1" in reply  # forwarded in origin form
    assert asked == ["public.test"]


async def test_connect_tunnels_bytes_after_the_check(base_url: str) -> None:
    port = _port(base_url)

    async def lookup(host: str, port: int) -> list[str]:
        return ["127.0.0.1"]

    async with GuardProxy(lookup=lookup) as proxy:
        parts = urlsplit(proxy.url)
        reader, writer = await asyncio.open_connection(parts.hostname, parts.port)
        writer.write(f"CONNECT public.test:{port} HTTP/1.1\r\n\r\n".encode())
        await writer.drain()
        established = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)
        writer.write(b"GET /echo HTTP/1.1\r\nHost: public.test\r\nConnection: close\r\n\r\n")
        await writer.drain()
        tunnelled = await asyncio.wait_for(reader.read(), 5)
        writer.close()
    assert established.startswith(b"HTTP/1.1 200")
    assert tunnelled.startswith(b"HTTP/1.1 200")


@pytest.mark.parametrize("head", [b"garbage\r\n\r\n", b"CONNECT nohost HTTP/1.1\r\n\r\n"])
async def test_a_malformed_request_is_refused(head: bytes) -> None:
    async with GuardProxy() as proxy:
        reply = await _exchange(proxy.url, head)
    assert reply.startswith(b"HTTP/1.1 400")


async def test_a_plain_http_exchange_is_one_shot(base_url: str) -> None:
    # A reused proxy connection would carry the next request to the host checked first.
    port = _port(base_url)

    async def lookup(host: str, port: int) -> list[str]:
        return ["127.0.0.1"]

    async with GuardProxy(lookup=lookup) as proxy:
        reply = await _exchange(
            proxy.url,
            f"GET http://public.test:{port}/echo HTTP/1.1\r\n"
            "Host: public.test\r\nProxy-Connection: keep-alive\r\n\r\n".encode(),
        )
    assert b"connection: close" in reply
    assert b"proxy-connection" not in reply
