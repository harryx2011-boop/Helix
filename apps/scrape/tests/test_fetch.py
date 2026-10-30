"""The /fetch behavior, ported from the tests in apps/fetch/src/main.rs."""

from __future__ import annotations

import pytest

from helix_scrape.fetcher import Refused, fetch, next_hop
from helix_scrape.models import FetchRequest


def req(url: str, **kw: object) -> FetchRequest:
    return FetchRequest(url=url, allow_private=True, **kw)  # type: ignore[arg-type]


async def test_tls_tier_asks_for_compression_like_chrome_and_decodes_it(base_url: str) -> None:
    echo = await fetch(req(f"{base_url}/echo"))
    assert echo.success and echo.body
    assert "accept-encoding: gzip, deflate, br, zstd" in echo.body
    zipped = await fetch(req(f"{base_url}/gzip"))
    assert zipped.body == "compressed hello"


async def test_default_identity_presents_windows(base_url: str) -> None:
    head = (await fetch(req(f"{base_url}/echo"))).body or ""
    assert 'sec-ch-ua-platform: "windows"' in head
    assert "user-agent: mozilla/5.0 (windows nt 10.0; win64; x64)" in head


async def test_the_plain_tier_sends_no_impersonation(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/echo", impersonate=False))
    assert res.success and res.profile_used is None
    assert "sec-ch-ua" not in (res.body or "")


async def test_profile_used_names_the_identity_that_was_sent(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/echo", profile="chrome-131"))
    assert res.profile_used == "chrome131"


async def test_body_over_the_cap_is_refused(base_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HELIX_FETCH_MAX_BODY_BYTES", str(1024 * 1024))
    res = await fetch(req(f"{base_url}/big"))
    assert res.body is None and res.status == 200
    assert (res.error or "").startswith("body exceeds ")
    assert res.success is False


async def test_every_set_cookie_survives(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/cookies"))
    assert res.set_cookies == ["a=1; Path=/", "b=2; Path=/"]
    assert isinstance(res.headers["set-cookie"], str)


async def test_headers_come_back_lowercased(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/echo"))
    assert all(k == k.lower() for k in res.headers)


async def test_caller_headers_win_over_the_profile(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/echo", headers={"User-Agent": "custom-agent/1"}))
    assert "user-agent: custom-agent/1" in (res.body or "")


async def test_redirects_are_followed_and_final_url_is_reported(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/redirect/3"))
    assert res.success and res.final_url == f"{base_url}/echo"


async def test_a_redirect_loop_stops_at_ten_hops(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/loop"))
    assert res.success is False and "too many redirects" in (res.error or "")


async def test_transport_error_keeps_its_dns_cause() -> None:
    res = await fetch(FetchRequest(url="https://nonexistent-host-helix-test.invalid/"))
    assert "dns" in (res.error or "").lower() and res.success is False
    assert res.status is None and res.body is None


async def test_timeout_is_reported_with_its_duration(base_url: str) -> None:
    res = await fetch(req(f"{base_url}/slow", timeout_ms=300))
    assert (res.error or "") == "timeout after 300ms"


async def test_a_private_url_is_refused_unless_allowed(base_url: str) -> None:
    res = await fetch(FetchRequest(url=f"{base_url}/echo"))
    assert res.success is False
    assert res.error == "private or local address, which this instance does not fetch"


async def test_an_invalid_url_is_reported() -> None:
    res = await fetch(FetchRequest(url="not a url"))
    assert (res.error or "").startswith("invalid url")


async def test_error_text_never_trips_the_services_down_classifier() -> None:
    # core/block-detection.ts checks these words first and would call the failure
    # "service_unavailable" instead of its real reason.
    res = await fetch(FetchRequest(url="https://nonexistent-host-helix-test.invalid/"))
    text = (res.error or "").lower()
    assert not any(w in text for w in ("service", "fetch failed", "unreachable", "helix-fetch"))


def test_a_redirect_to_a_private_address_is_refused() -> None:
    for target in ("http://169.254.169.254/latest", "http://localhost/x", "http://[::1]/"):
        with pytest.raises(Refused, match="redirected to a private or local address"):
            next_hop("https://example.com/a", target, hops_done=1, allow_private=False)


def test_a_relative_redirect_resolves_against_the_current_url() -> None:
    url = next_hop("https://example.com/a/b", "../c?x=1", hops_done=0, allow_private=False)
    assert url == "https://example.com/c?x=1"


def test_the_eleventh_redirect_is_refused() -> None:
    with pytest.raises(Refused, match="too many redirects"):
        next_hop("https://example.com/a", "/b", hops_done=10, allow_private=False)


def test_allow_private_permits_a_private_redirect() -> None:
    assert (
        next_hop("http://a.test/", "http://127.0.0.1/x", 0, allow_private=True)
        == "http://127.0.0.1/x"
    )
