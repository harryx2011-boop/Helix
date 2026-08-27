from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]


class ConfigError(Exception):
    pass


def load_env() -> None:
    for candidate in (REPO_ROOT / ".env", Path.cwd() / ".env"):
        if candidate.is_file():
            load_dotenv(candidate, override=False)


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str) -> tuple[str, ...]:
    raw = os.environ.get(name, "").strip()
    return tuple(item.strip() for item in raw.split(",") if item.strip())


def _number(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from exc


@dataclass(frozen=True)
class Settings:
    base_url: str
    token: str
    timeout: float = 30.0
    cache_ttl: int = 300
    max_concurrency: int = 5
    anonymize_students: bool = False
    download_dir: Path | None = None
    auth_token: str | None = None
    allowed_hosts: tuple[str, ...] = ()

    @classmethod
    def from_env(cls) -> Settings:
        load_env()
        url = os.environ.get("CANVAS_URL", "").strip().rstrip("/")
        token = os.environ.get("CANVAS_TOKEN", "").strip()
        if not url or not token:
            raise ConfigError(
                "CANVAS_URL and CANVAS_TOKEN are required. Copy .env.example to .env and fill them in."
            )
        if url.endswith("/api/v1"):
            url = url[: -len("/api/v1")]
        if not url.startswith("https://"):
            raise ConfigError("CANVAS_URL must start with https://")
        download_dir = os.environ.get("CANVAS_DOWNLOAD_DIR", "").strip()
        auth_token = os.environ.get("CANVAS_MCP_AUTH_TOKEN", "").strip()
        if auth_token and (len(auth_token) < 16 or any(c in auth_token for c in " /?#")):
            raise ConfigError(
                "CANVAS_MCP_AUTH_TOKEN must be at least 16 characters and contain no "
                "spaces or / ? # (it is used both as a bearer token and as a URL path "
                "segment). Generate one with: python -c "
                "\"import secrets; print(secrets.token_urlsafe(32))\""
            )
        return cls(
            base_url=url,
            token=token,
            timeout=_number("CANVAS_TIMEOUT", 30.0),
            cache_ttl=int(_number("CANVAS_CACHE_TTL", 300)),
            max_concurrency=max(1, int(_number("CANVAS_MAX_CONCURRENCY", 5))),
            anonymize_students=_bool("CANVAS_ANONYMIZE_STUDENTS", False),
            download_dir=Path(download_dir).expanduser() if download_dir else None,
            auth_token=auth_token or None,
            allowed_hosts=_list("CANVAS_MCP_ALLOWED_HOSTS"),
        )

    @property
    def host(self) -> str:
        return self.base_url.removeprefix("https://")

    def masked_token(self) -> str:
        return _mask(self.token)

    def masked_auth_token(self) -> str:
        return _mask(self.auth_token) if self.auth_token else "(not set)"


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"
