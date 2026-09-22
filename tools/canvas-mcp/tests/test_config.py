from __future__ import annotations

from pathlib import Path

import pytest

from canvaslms_api import config
from canvaslms_api.config import ConfigError, Settings, load_env


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
        "CANVAS_PRIVACY_MODE",
        "CANVAS_PRIVACY_DIR",
        "CANVAS_PRIVACY_KEY",
        "CANVAS_RETENTION_DAYS",
        "CANVAS_MCP_ALLOWED_HOSTS",
    ):
        monkeypatch.delenv(name, raising=False)


def test_from_env_strips_api_v1_suffix(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com/api/v1")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    settings = Settings.from_env()
    assert settings.base_url == "https://school.instructure.com"


def test_from_env_strips_trailing_slash(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com/")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    settings = Settings.from_env()
    assert settings.base_url == "https://school.instructure.com"


def test_from_env_missing_url_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    with pytest.raises(ConfigError):
        Settings.from_env()


def test_from_env_missing_token_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    with pytest.raises(ConfigError):
        Settings.from_env()


def test_from_env_rejects_http(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "http://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    with pytest.raises(ConfigError):
        Settings.from_env()


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1", "pseudonymize"),
        ("true", "pseudonymize"),
        ("True", "pseudonymize"),
        ("TRUE", "pseudonymize"),
        ("yes", "pseudonymize"),
        ("YES", "pseudonymize"),
        ("on", "pseudonymize"),
        ("On", "pseudonymize"),
        # The legacy flag can only turn privacy up. .env.example shipped with
        # CANVAS_ANONYMIZE_STUDENTS=false, so "false" is not a real choice.
        ("0", "strict"),
        ("false", "strict"),
        ("no", "strict"),
        ("off", "strict"),
        ("garbage", "strict"),
    ],
)
def test_legacy_anonymize_flag_maps_to_privacy_mode(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: str
) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_ANONYMIZE_STUDENTS", raw)
    settings = Settings.from_env()
    assert settings.privacy_mode == expected
    assert settings.anonymize_students is True


def test_privacy_defaults_to_strict_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    settings = Settings.from_env()
    assert settings.privacy_mode == "strict"
    assert settings.download_dir_managed is True
    assert settings.download_dir == settings.privacy_path / "downloads"


@pytest.mark.parametrize("mode", ["off", "pseudonymize", "strict", "STRICT"])
def test_privacy_mode_explicit(monkeypatch: pytest.MonkeyPatch, mode: str) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_PRIVACY_MODE", mode)
    monkeypatch.setenv("CANVAS_ANONYMIZE_STUDENTS", "true")
    settings = Settings.from_env()
    assert settings.privacy_mode == mode.lower()
    assert settings.download_dir_managed is (mode.lower() != "off")


def test_privacy_mode_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_PRIVACY_MODE", "maybe")
    with pytest.raises(ConfigError):
        Settings.from_env()


def test_explicit_download_dir_is_never_managed(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_DOWNLOAD_DIR", str(tmp_path))
    settings = Settings.from_env()
    assert settings.download_dir == tmp_path
    assert settings.download_dir_managed is False


def test_short_privacy_key_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_PRIVACY_KEY", "short")
    with pytest.raises(ConfigError):
        Settings.from_env()


def test_from_env_numbers(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_TIMEOUT", "15.5")
    monkeypatch.setenv("CANVAS_CACHE_TTL", "120")
    monkeypatch.setenv("CANVAS_MAX_CONCURRENCY", "3")
    settings = Settings.from_env()
    assert settings.timeout == 15.5
    assert settings.cache_ttl == 120
    assert settings.max_concurrency == 3


def test_from_env_bad_number_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_TIMEOUT", "not-a-number")
    with pytest.raises(ConfigError):
        Settings.from_env()


def test_from_env_max_concurrency_floor(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_MAX_CONCURRENCY", "0")
    settings = Settings.from_env()
    assert settings.max_concurrency == 1


def test_masked_token_short() -> None:
    settings = Settings(base_url="https://x.test", token="short")
    assert settings.masked_token() == "*****"


def test_masked_token_long() -> None:
    settings = Settings(base_url="https://x.test", token="abcdefghijkl")
    assert settings.masked_token() == "abcd...ijkl"


def test_host_property() -> None:
    settings = Settings(base_url="https://school.instructure.com", token="t")
    assert settings.host == "school.instructure.com"


def test_load_env_reads_repo_root_without_override(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _clear_canvas_env(monkeypatch)
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".env").write_text("CANVAS_URL=https://from-dotenv.instructure.com\nCANVAS_TOKEN=dotenv-token\n")

    cwd = tmp_path / "elsewhere"
    cwd.mkdir()

    monkeypatch.setattr(config, "REPO_ROOT", repo_root)
    monkeypatch.setattr(Path, "cwd", classmethod(lambda cls: cwd))

    load_env()
    import os

    assert os.environ.get("CANVAS_URL") == "https://from-dotenv.instructure.com"
    assert os.environ.get("CANVAS_TOKEN") == "dotenv-token"


def test_load_env_does_not_override_existing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / ".env").write_text("CANVAS_URL=https://from-dotenv.instructure.com\n")

    monkeypatch.setattr(config, "REPO_ROOT", repo_root)
    monkeypatch.setattr(Path, "cwd", classmethod(lambda cls: repo_root))
    monkeypatch.setenv("CANVAS_URL", "https://already-set.instructure.com")

    load_env()
    import os

    assert os.environ.get("CANVAS_URL") == "https://already-set.instructure.com"


def test_from_env_reads_auth_token_and_allowed_hosts(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_MCP_AUTH_TOKEN", "a-long-enough-shared-secret")
    monkeypatch.setenv("CANVAS_MCP_ALLOWED_HOSTS", "demo.trycloudflare.com, mcp.example.com")
    settings = Settings.from_env()
    assert settings.auth_token == "a-long-enough-shared-secret"
    assert settings.allowed_hosts == ("demo.trycloudflare.com", "mcp.example.com")


def test_from_env_without_auth_token_leaves_it_none(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    settings = Settings.from_env()
    assert settings.auth_token is None
    assert settings.allowed_hosts == ()


@pytest.mark.parametrize("value", ["short", "has spaces in it here", "has/a/slash/in/it/here"])
def test_from_env_rejects_weak_auth_token(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_MCP_AUTH_TOKEN", value)
    with pytest.raises(ConfigError):
        Settings.from_env()


def test_masked_auth_token_hides_the_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_canvas_env(monkeypatch)
    monkeypatch.setenv("CANVAS_URL", "https://school.instructure.com")
    monkeypatch.setenv("CANVAS_TOKEN", "abc123")
    monkeypatch.setenv("CANVAS_MCP_AUTH_TOKEN", "supersecretsharedvalue")
    settings = Settings.from_env()
    assert settings.masked_auth_token() == "supe...alue"
    assert "secretshared" not in settings.masked_auth_token()
