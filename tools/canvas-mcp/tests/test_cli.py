from __future__ import annotations

import asyncio

import pytest
import respx

from canvaslms_api.cli import main
from canvaslms_api.http_auth import SharedSecretGuard


def _clear_canvas_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "CANVAS_URL",
        "CANVAS_TOKEN",
        "CANVAS_TIMEOUT",
        "CANVAS_CACHE_TTL",
        "CANVAS_MAX_CONCURRENCY",
        "CANVAS_ANONYMIZE_STUDENTS",
        "CANVAS_DOWNLOAD_DIR",
        "CANVAS_MCP_AUTH_TOKEN",
        "CANVAS_MCP_ALLOWED_HOSTS",
        "CANVAS_PRIVACY_MODE",
        "CANVAS_PRIVACY_ACK_TUNNEL",
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


def test_http_off_loopback_without_auth_token_refuses(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _set_env(monkeypatch)
    exit_code = main(["--transport", "http", "--host", "0.0.0.0"])
    captured = capsys.readouterr()
    assert exit_code == 2
    assert "CANVAS_MCP_AUTH_TOKEN" in captured.err


def test_http_with_allowed_host_but_no_auth_token_refuses(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _set_env(monkeypatch)
    exit_code = main(["--transport", "http", "--allowed-host", "demo.trycloudflare.com"])
    captured = capsys.readouterr()
    assert exit_code == 2
    assert "CANVAS_MCP_AUTH_TOKEN" in captured.err


def test_http_with_auth_token_installs_guard_and_allowed_hosts(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _set_env(monkeypatch)
    monkeypatch.setenv("CANVAS_MCP_AUTH_TOKEN", "a-long-enough-shared-secret")
    monkeypatch.setenv("CANVAS_MCP_ALLOWED_HOSTS", "demo.trycloudflare.com")
    # Strict privacy (the default) also needs the tunnel acknowledged.
    monkeypatch.setenv("CANVAS_PRIVACY_ACK_TUNNEL", "1")
    recorded: dict[str, object] = {}

    def fake_run(self, **kwargs):  # noqa: ANN001, ANN202
        recorded.update(kwargs)

    monkeypatch.setattr("fastmcp.FastMCP.run", fake_run)
    exit_code = main(["--transport", "http", "--allowed-host", "mcp.example.com"])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert recorded["transport"] == "http"
    assert recorded["allowed_hosts"] == ["demo.trycloudflare.com", "mcp.example.com"]
    assert recorded["host_origin_protection"] is True
    middleware = recorded["middleware"]
    assert middleware is not None and middleware[0].cls is SharedSecretGuard
    assert "/s/a-long-enough-shared-secret/mcp" in captured.out


def test_http_on_loopback_without_auth_token_still_runs_open(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_env(monkeypatch)
    recorded: dict[str, object] = {}

    def fake_run(self, **kwargs):  # noqa: ANN001, ANN202
        recorded.update(kwargs)

    monkeypatch.setattr("fastmcp.FastMCP.run", fake_run)
    exit_code = main(["--transport", "http"])

    assert exit_code == 0
    assert recorded["middleware"] is None
    assert recorded["allowed_hosts"] is None
    assert recorded["host_origin_protection"] is None


# -- subcommands and student privacy --------------------------------------

_BASE = "https://canvas.test/api/v1"
_ROSTER = [
    {"id": 1, "name": "Dana Okafor", "enrollments": [{"type": "TeacherEnrollment", "course_id": 10}]},
    {
        "id": 501,
        "name": "Maya Chen",
        "email": "maya.chen@kids.example",
        "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 7}],
    },
]


def _mock_course(mock: respx.MockRouter) -> None:
    mock.get(f"{_BASE}/users/self").respond(json={"id": 1, "name": "Dana Okafor"})
    mock.get(f"{_BASE}/courses").respond(json=[{"id": 10, "name": "Biology", "course_code": "BIO"}])
    mock.get(f"{_BASE}/courses/10").respond(json={"id": 10, "name": "Biology", "course_code": "BIO"})
    mock.get(f"{_BASE}/courses/10/users").respond(json=_ROSTER)
    mock.get(f"{_BASE}/courses/10/sections").respond(json=[{"id": 7, "name": "Period 3"}])


def test_strict_http_through_tunnel_refuses_without_ack(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _set_env(monkeypatch)
    monkeypatch.setenv("CANVAS_MCP_AUTH_TOKEN", "a-long-enough-shared-secret")
    exit_code = main(["--transport", "http", "--allowed-host", "demo.trycloudflare.com"])
    assert exit_code == 2
    assert "CANVAS_PRIVACY_ACK_TUNNEL" in capsys.readouterr().err


def test_serve_subcommand_accepts_transport_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_env(monkeypatch)
    recorded: dict[str, object] = {}
    monkeypatch.setattr("fastmcp.FastMCP.run", lambda self, **kw: recorded.update(kw))
    assert main(["serve", "--transport", "http", "--port", "7222"]) == 0
    assert recorded["port"] == 7222


def test_tools_subcommand_lists_and_filters(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _set_env(monkeypatch)
    assert main(["tools", "--search", "rubric"]) == 0
    out = capsys.readouterr().out
    assert "get_rubric" in out and "list_courses" not in out


async def test_call_runs_a_tool_through_the_privacy_layer(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], mock: respx.MockRouter
) -> None:
    _set_env(monkeypatch)
    _mock_course(mock)
    exit_code = await asyncio.to_thread(main, ["call", "list_users", "course=10"])
    out = capsys.readouterr().out
    assert exit_code == 0
    assert "Maya" not in out and "P3-" in out and "Dana Okafor" in out


async def test_call_unknown_tool_suggests(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _set_env(monkeypatch)
    exit_code = await asyncio.to_thread(main, ["call", "list_user"])
    assert exit_code == 2
    assert "list_users" in capsys.readouterr().err


def test_call_bad_pair_returns_2(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    _set_env(monkeypatch)
    assert main(["call", "list_users", "course"]) == 2


async def test_privacy_roster_shows_names_in_terminal_only(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], mock: respx.MockRouter
) -> None:
    _set_env(monkeypatch)
    _mock_course(mock)
    exit_code = await asyncio.to_thread(main, ["privacy", "roster", "10"])
    out = capsys.readouterr().out
    assert exit_code == 0
    assert "Maya Chen" in out and "P3-" in out
    assert "Dana Okafor" not in out  # staff are not labelled


async def test_privacy_scan_finds_and_redacts(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], mock: respx.MockRouter, tmp_path
) -> None:
    _set_env(monkeypatch)
    _mock_course(mock)
    notes = tmp_path / "notes.txt"
    notes.write_text("Maya Chen needs help. Email maya.chen@kids.example.\n")
    assert await asyncio.to_thread(main, ["privacy", "scan", str(notes)]) == 3
    assert "Maya Chen" in capsys.readouterr().out
    assert await asyncio.to_thread(main, ["privacy", "scan", str(notes), "--redact"]) == 0
    redacted = capsys.readouterr().out
    assert "Maya" not in redacted and "P3-" in redacted


def test_privacy_purge_crosswalk(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    _set_env(monkeypatch)
    assert main(["privacy", "purge", "--crosswalk", "--yes"]) == 0
    assert "Deleted the crosswalk" in capsys.readouterr().out


def test_privacy_roster_needs_privacy_on(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_env(monkeypatch)
    monkeypatch.setenv("CANVAS_PRIVACY_MODE", "off")
    assert main(["privacy", "roster", "10"]) == 2
