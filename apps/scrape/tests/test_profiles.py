"""Helix's identity names mapped onto curl_cffi's impersonation targets."""

from __future__ import annotations

import pytest
from curl_cffi.requests import BrowserType
from helix_scrape.profiles import DEFAULT_TARGET, available, resolve


def test_every_target_exists_in_the_installed_curl_cffi() -> None:
    known = {b.value for b in BrowserType}
    missing = [t for t in available() if t not in known]
    assert not missing, f"curl_cffi no longer ships: {missing}"


def test_the_default_is_a_windows_chrome() -> None:
    assert resolve(None).target == DEFAULT_TARGET
    assert DEFAULT_TARGET.startswith("chrome")
    assert "macos" not in DEFAULT_TARGET and "android" not in DEFAULT_TARGET


@pytest.mark.parametrize("name", ["chrome", "chrome-149"])
def test_chrome_aliases_and_the_old_default_resolve_to_the_default(name: str) -> None:
    assert resolve(name).target == DEFAULT_TARGET


def test_an_exact_chrome_version_is_used_as_is() -> None:
    assert resolve("chrome-131").target == "chrome131"
    assert resolve("chrome-146").target == "chrome146"


def test_a_missing_chrome_version_takes_the_nearest_and_reports_it() -> None:
    got = resolve("chrome-132")
    assert got.target == "chrome131"  # 131 and 133 are equally near; the lower one wins
    assert got.id == "chrome131"


@pytest.mark.parametrize("name", ["edge", "edge-148", "edge-127"])
def test_edge_maps_to_a_chrome_target_and_says_so(name: str) -> None:
    got = resolve(name)
    assert got.target.startswith("chrome")
    assert got.id == got.target  # never labelled Edge when Chrome is what was sent


def test_safari_picks_the_nearest_desktop_version() -> None:
    assert resolve("safari").target.startswith("safari")
    assert "ios" not in resolve("safari").target
    assert resolve("safari-17-5").target == "safari170"
    assert resolve("safari-18-5").target == "safari184"


def test_ios_safari_stays_on_ios_targets() -> None:
    for name in ("safari-ios", "safari-ios-26-2", "safari-ios-18-1-1"):
        assert resolve(name).target.endswith("_ios"), name


def test_an_unknown_name_falls_back_to_the_default() -> None:
    assert resolve("netscape-4").target == DEFAULT_TARGET


def test_a_target_name_round_trips() -> None:
    for target in available():
        assert resolve(target).target == target
