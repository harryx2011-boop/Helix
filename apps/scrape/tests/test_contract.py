"""One /fetch contract, run against helix-scrape and, when a binary is given, the Rust service.

HELIX_FETCH_RUST_EXE=<path to helix-fetch.exe> adds the Rust run. The assertions are the parts
of the wire shape the API depends on (core/block-detection.ts, fetch/client.ts), so a pass on
both means the swap in Phase 1 changes nothing the API can see.
"""

from __future__ import annotations

import os
import socket
import subprocess
import time
from collections.abc import AsyncIterator, Iterator

import httpx
import pytest

from helix_scrape.main import app

RUST_EXE = os.environ.get("HELIX_FETCH_RUST_EXE")
IMPLEMENTATIONS = ["scrape", *(["rust"] if RUST_EXE else [])]


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture(scope="module")
def rust_url() -> Iterator[str]:
    port = _free_port()
    env = {
        **os.environ,
        "HELIX_FETCH_PORT": str(port),
        "HELIX_FETCH_HOST": "127.0.0.1",
        "HELIX_FETCH_MAX_BODY_BYTES": str(1024 * 1024),
    }
    proc = subprocess.Popen(
        [str(RUST_EXE)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    url = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                if httpx.get(f"{url}/health", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.2)
        else:
            pytest.fail("the Rust service did not come up")
        yield url
    finally:
        proc.terminate()


@pytest.fixture(params=IMPLEMENTATIONS)
async def post(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator:
    if request.param == "rust":
        url = request.getfixturevalue("rust_url")
        async with httpx.AsyncClient(base_url=url, timeout=60) as client:
            yield lambda body: client.post("/fetch", json=body)
    else:
        monkeypatch.setenv("HELIX_FETCH_MAX_BODY_BYTES", str(1024 * 1024))
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://t", timeout=60
        ) as client:
            yield lambda body: client.post("/fetch", json=body)


async def call(post, **body: object) -> dict:
    res = await post(body)
    assert res.status_code == 200
    return res.json()


async def test_shape_and_set_cookies(post, base_url: str) -> None:
    got = await call(post, url=f"{base_url}/cookies", allow_private=True)
    assert got["success"] is True and got["status"] == 200
    assert got["set_cookies"] == ["a=1; Path=/", "b=2; Path=/"]
    assert isinstance(got["headers"]["set-cookie"], str)
    assert {"timing_ms", "final_url", "profile_used", "error", "body"} <= set(got)


async def test_chrome_compression_and_windows_identity(post, base_url: str) -> None:
    head = (await call(post, url=f"{base_url}/echo", allow_private=True))["body"]
    assert "accept-encoding: gzip, deflate, br, zstd" in head
    assert 'sec-ch-ua-platform: "windows"' in head
    zipped = await call(post, url=f"{base_url}/gzip", allow_private=True)
    assert zipped["body"] == "compressed hello"


async def test_body_cap_keeps_status_and_drops_body(post, base_url: str) -> None:
    got = await call(post, url=f"{base_url}/big", allow_private=True)
    assert got["success"] is False and got["status"] == 200 and got["body"] is None
    assert got["error"].startswith("body exceeds ")


async def test_private_url_is_refused_with_the_same_words(post, base_url: str) -> None:
    got = await call(post, url=f"{base_url}/echo")
    assert got["success"] is False
    assert got["error"] == "private or local address, which this instance does not fetch"


async def test_dns_failure_names_dns(post) -> None:
    got = await call(post, url="https://nonexistent-host-helix-test.invalid/")
    assert got["success"] is False and "dns" in got["error"].lower()
    assert got["status"] is None


async def test_timeout_and_invalid_url_prefixes(post, base_url: str) -> None:
    slow = await call(post, url=f"{base_url}/slow", allow_private=True, timeout_ms=300)
    assert slow["error"].startswith("timeout after")
    bad = await call(post, url="not a url")
    assert bad["error"].startswith("invalid url")
