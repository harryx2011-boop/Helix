from __future__ import annotations

import asyncio

import pytest
import respx

from canvaslms_api.cli import main


def _clear_canvas_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "CANVAS_URL",
        "CANVAS_TOKEN",
        "CANVAS_TIMEOUT",
        "CANVAS_CACHE_TTL",
        "CANVAS_MAX_CONCURRENCY",
        "CANVAS_ANONYMIZE_STUDENTS",
        "CANVAS_DOWNLOAD_DIR",
    ):
        monkeypatch.delenv(name, raising=False)


def _set_env(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://canvas.test")
    monkeypatch.setenv("CANVAS_TOKEN", "t0ken12345")


def test_main_config_prints_masked_token_and_host(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _set_env(monkeypatch)
    exit_code = main(["--config"])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "canvas.test" in captured.out
    assert "t0ke...2345" in captured.out
    assert "t0ken12345" not in captured.out


def test_main_version_exits_zero(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc_info:
        main(["--version"])
    assert exc_info.value.code == 0
    captured = capsys.readouterr()
    from canvaslms_api import __version__

    assert __version__ in captured.out


def test_main_missing_env_returns_2(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _clear_canvas_env(monkeypatch)
    exit_code = main(["--config"])
    captured = capsys.readouterr()
    assert exit_code == 2
    assert "Configuration error" in captured.err


async def test_main_test_success_prints_name_and_course_count(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], mock: respx.MockRouter
) -> None:
    _set_env(monkeypatch)
    mock.get("https://canvas.test/api/v1/users/self/profile").respond(
        json={"name": "Ada Lovelace", "id": 1}
    )
    mock.get("https://canvas.test/api/v1/courses", params={"per_page": "100"}).respond(
        json=[
            {"id": 1, "name": "Course A", "course_code": "A101"},
            {"id": 2, "name": "Course B", "course_code": "B101"},
        ]
    )
    exit_code = await asyncio.to_thread(main, ["--test"])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Ada Lovelace" in captured.out
    assert "2 active course" in captured.out


async def test_main_test_401_returns_1_and_prints_hint(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], mock: respx.MockRouter
) -> None:
    _set_env(monkeypatch)
    mock.get("https://canvas.test/api/v1/users/self/profile").respond(
        401, json={"errors": [{"message": "invalid access token"}]}
    )
    exit_code = await asyncio.to_thread(main, ["--test"])
    captured = capsys.readouterr()
    assert exit_code == 1
    assert "token" in captured.err.lower()
