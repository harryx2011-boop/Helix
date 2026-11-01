"""The HTTP surface: /health, /fetch and the service token."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest

from helix_scrape import __version__
from helix_scrape.main import app


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def test_health_reports_the_contract_fields(client: httpx.AsyncClient) -> None:
    body = (await client.get("/health")).json()
    assert body["status"] == "ok"
    assert body["version"] == __version__
    assert body["profiles_loaded"] > 0
    assert body["definitions_loaded"] == 0


async def test_fetch_returns_the_wire_shape(client: httpx.AsyncClient, base_url: str) -> None:
    res = await client.post("/fetch", json={"url": f"{base_url}/cookies", "allow_private": True})
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {
        "success", "status", "headers", "set_cookies", "body", "profile_used",
        "final_url", "timing_ms", "error",
    }  # fmt: skip
    assert body["success"] is True and body["status"] == 200


async def test_a_failed_fetch_is_still_http_200(client: httpx.AsyncClient) -> None:
    res = await client.post("/fetch", json={"url": "https://nonexistent-host-helix-test.invalid/"})
    assert res.status_code == 200
    assert res.json()["success"] is False


async def test_no_token_configured_means_open(client: httpx.AsyncClient) -> None:
    res = await client.post("/fetch", json={"url": "not a url"})
    assert res.status_code == 200


async def test_fetch_needs_the_token_when_one_is_set(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HELIX_SERVICE_TOKEN", "secret-token")
    body = {"url": "not a url"}
    assert (await client.post("/fetch", json=body)).status_code == 401
    wrong = {"x-helix-service-token": "secret-tokeX"}
    assert (await client.post("/fetch", json=body, headers=wrong)).status_code == 401
    right = {"x-helix-service-token": "secret-token"}
    assert (await client.post("/fetch", json=body, headers=right)).status_code == 200


async def test_health_stays_open_with_a_token(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HELIX_SERVICE_TOKEN", "secret-token")
    assert (await client.get("/health")).status_code == 200


async def test_a_malformed_body_is_a_422_not_a_crash(client: httpx.AsyncClient) -> None:
    assert (await client.post("/fetch", json={})).status_code == 422


async def test_render_refuses_a_private_page_with_http_200(client: httpx.AsyncClient) -> None:
    res = await client.post("/render", json={"url": "http://127.0.0.1:9/"})
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {
        "success", "status", "headers", "body", "final_url", "cookies", "profile_used",
        "timing_ms", "error",
    }  # fmt: skip
    assert body["success"] is False
    assert "private or local address" in body["error"]


async def test_render_needs_the_token_when_one_is_set(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HELIX_SERVICE_TOKEN", "secret-token")
    assert (await client.post("/render", json={"url": "not a url"})).status_code == 401
