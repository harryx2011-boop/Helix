from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import respx

from canvaslms_api.app import App, build_app
from canvaslms_api.config import Settings

_CANVAS_ENV_VARS = (
    "CANVAS_URL",
    "CANVAS_TOKEN",
    "CANVAS_TIMEOUT",
    "CANVAS_CACHE_TTL",
    "CANVAS_MAX_CONCURRENCY",
    "CANVAS_ANONYMIZE_STUDENTS",
    "CANVAS_DOWNLOAD_DIR",
)


@pytest.fixture(autouse=True)
def _isolated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep tests independent of the repo's real .env and shell environment.

    Settings.from_env() calls load_env(), which reads REPO_ROOT/.env (this
    repo has a real one with real credentials). Without this, tests that
    exercise missing/partial env vars would silently see real values.
    Tests that specifically exercise load_env() patch config.REPO_ROOT /
    Path.cwd themselves and so are unaffected by the no-op below.
    """
    for name in _CANVAS_ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr("canvaslms_api.config.load_env", lambda: None)


@pytest.fixture
def settings() -> Settings:
    return Settings(
        base_url="https://canvas.test",
        token="t0ken",
        timeout=1.0,
        cache_ttl=60,
        max_concurrency=2,
    )


@pytest.fixture
async def app(settings: Settings) -> AsyncIterator[App]:
    instance = build_app(settings)
    try:
        yield instance
    finally:
        await instance.aclose()


@pytest.fixture
def mock() -> AsyncIterator[respx.MockRouter]:
    with respx.mock(assert_all_called=False) as router:
        yield router
