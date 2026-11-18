"""The headed real-Chrome rule: where Chrome is, which profile a host uses, when headed mode is
possible, the launch options, the challenge budget and the per-host profile lock.

All pure, no browser: the fake session classes stand in for Scrapling's.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest

from helix_scrape import chrome

BASE_FLAGS = ("--no-pings", "--start-maximized", "--window-position=0,0", "--mute-audio")


def test_s6_the_first_existing_candidate_is_the_chrome(tmp_path: Path) -> None:
    exe = tmp_path / "chrome.exe"
    exe.write_text("")
    assert chrome.find_chrome([tmp_path / "missing.exe", exe]) == str(exe)


def test_s6_no_candidate_means_no_chrome(tmp_path: Path) -> None:
    assert chrome.find_chrome([tmp_path / "a", tmp_path / "b"]) is None


def test_s6_windows_candidates_follow_the_install_locations() -> None:
    env = {
        "PROGRAMFILES": r"C:\Program Files",
        "PROGRAMFILES(X86)": r"C:\Program Files (x86)",
        "LOCALAPPDATA": r"C:\Users\h\AppData\Local",
    }
    found = [str(p) for p in chrome.chrome_candidates(env, "win32")]
    assert len(found) == 3
    assert all(p.endswith("chrome.exe") and "Google" in p for p in found)
    assert any("(x86)" in p for p in found)


def test_s6_linux_candidates_are_the_google_chrome_paths() -> None:
    found = [str(p).replace("\\", "/") for p in chrome.chrome_candidates({}, "linux")]
    assert "/opt/google/chrome/chrome" in found


def test_s7_the_profile_dir_env_wins() -> None:
    path = chrome.profile_dir("example.com", {"HELIX_SCRAPE_PROFILE_DIR": "/data/p"})
    assert path == Path("/data/p") / "example.com"


def test_s7_the_default_root_is_under_local_app_data() -> None:
    path = chrome.profile_dir("example.com", {"LOCALAPPDATA": "/local"})
    assert path == Path("/local") / "Helix" / "chrome-profiles" / "example.com"


def test_s7_a_host_never_escapes_the_root() -> None:
    root = {"HELIX_SCRAPE_PROFILE_DIR": "/data/p"}
    for host in ("..", "a/../../etc", "a\\b", "[::1]", "UPPER.Example.COM", ""):
        path = chrome.profile_dir(host, root)
        assert path.parent == Path("/data/p")
        assert path.name not in ("", ".", "..")
    assert chrome.profile_dir("UPPER.Example.COM", root).name == "upper.example.com"


def test_s7_two_hosts_never_share_a_profile() -> None:
    root = {"HELIX_SCRAPE_PROFILE_DIR": "/data/p"}
    assert chrome.profile_dir("a.example.com", root) != chrome.profile_dir("b.example.com", root)


def test_s8_headed_needs_chrome() -> None:
    assert chrome.headed_enabled({}, "win32", None) is False
    assert chrome.headed_enabled({}, "win32", "C:/chrome.exe") is True


@pytest.mark.parametrize("value", ["0", "false", "off", "no", "OFF"])
def test_s8_the_env_switch_turns_headed_off(value: str) -> None:
    assert chrome.headed_enabled({"HELIX_SCRAPE_HEADED": value}, "win32", "C:/chrome.exe") is False


def test_s8_linux_without_a_display_stays_headless() -> None:
    assert chrome.headed_enabled({}, "linux", "/opt/google/chrome/chrome") is False
    assert chrome.headed_enabled({"DISPLAY": ":0"}, "linux", "/opt/google/chrome/chrome") is True


def test_s9_the_window_is_off_screen_and_not_maximized() -> None:
    args = chrome.headed_args(BASE_FLAGS, block_webrtc=False)
    assert "--start-maximized" not in args
    assert "--window-position=0,0" not in args
    assert [a for a in args if a.startswith("--window-position=")] == [
        "--window-position=-32000,-32000"
    ]
    assert "--no-pings" in args and "--mute-audio" in args


def test_s9_webrtc_stays_locked_when_asked() -> None:
    locked = chrome.headed_args(BASE_FLAGS, block_webrtc=True)
    assert "--webrtc-ip-handling-policy=disable_non_proxied_udp" in locked
    assert "--force-webrtc-ip-handling-policy" in locked
    open_ = chrome.headed_args(BASE_FLAGS, block_webrtc=False)
    assert "--force-webrtc-ip-handling-policy" not in open_


def test_s10_headed_options_use_real_chrome_and_inject_nothing(tmp_path: Path) -> None:
    options = chrome.headed_options(tmp_path / "p", BASE_FLAGS, block_webrtc=True)
    assert options["real_chrome"] is True
    assert options["headless"] is False
    assert options["user_data_dir"] == str(tmp_path / "p")
    assert "executable_path" not in options
    assert "useragent" not in options
    extra = options["additional_args"]
    assert extra["no_viewport"] is True
    assert all(
        extra[k] is None for k in ("viewport", "screen", "device_scale_factor", "color_scheme")
    )
    assert "--window-position=-32000,-32000" in extra["args"]


def test_s11_the_budget_defaults_to_twenty_seconds() -> None:
    assert chrome.challenge_budget_ms({}) == 20_000


def test_s11_the_budget_env_is_read_and_bad_values_fall_back() -> None:
    assert chrome.challenge_budget_ms({"HELIX_SCRAPE_CHALLENGE_BUDGET_MS": "5000"}) == 5000
    for bad in ("0", "-3", "soon"):
        assert chrome.challenge_budget_ms({"HELIX_SCRAPE_CHALLENGE_BUDGET_MS": bad}) == 20_000


class _Solver:
    nap = 0.0
    retry = False

    def __init__(self) -> None:
        self.calls: list[int] = []

    async def _cloudflare_solver(self, page: Any, _attempts: int = 0) -> None:
        self.calls.append(_attempts)
        await asyncio.sleep(self.nap)
        if _attempts == 0 and self.retry:
            await self._cloudflare_solver(page, 1)


async def test_s11_a_solver_that_finishes_reports_its_time() -> None:
    spent: list[int] = []
    session = chrome.with_challenge_budget(_Solver, 2_000, spent.append)()
    session.nap = 0.05
    await session._cloudflare_solver(object())
    assert len(spent) == 1 and 40 <= spent[0] < 1_000


async def test_s11_a_solver_past_the_budget_is_stopped_with_the_time_spent() -> None:
    spent: list[int] = []
    session = chrome.with_challenge_budget(_Solver, 150, spent.append)()
    session.nap = 5
    with pytest.raises(chrome.ChallengeTimeoutError) as raised:
        await session._cloudflare_solver(object())
    assert 140 <= raised.value.ms < 1_000
    assert spent == [raised.value.ms]


async def test_s11_the_solvers_own_retries_share_one_budget() -> None:
    spent: list[int] = []
    session = chrome.with_challenge_budget(_Solver, 2_000, spent.append)()
    session.retry = True
    await session._cloudflare_solver(object())
    assert session.calls == [0, 1]
    assert len(spent) == 1


async def test_s12_the_same_host_gets_one_lock_and_other_hosts_their_own() -> None:
    assert chrome.profile_lock("a.example") is chrome.profile_lock("a.example")
    assert chrome.profile_lock("a.example") is not chrome.profile_lock("b.example")
