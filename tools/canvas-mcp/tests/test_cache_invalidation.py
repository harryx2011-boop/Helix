from __future__ import annotations

import pytest
import respx
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from canvaslms_api.app import App
from canvaslms_api.client import CanvasClient
from canvaslms_api.config import Settings
from canvaslms_api.courses import CourseResolver
from canvaslms_api.tools import identity, migrations, pages


@pytest.fixture
def app(settings: Settings) -> App:
    client = CanvasClient(settings)
    return App(settings=settings, client=client, courses=CourseResolver(client, settings.cache_ttl))


def _mcp(app: App) -> FastMCP:
    mcp = FastMCP("test")
    migrations.register(mcp, app)
    pages.register(mcp, app)
    identity.register(mcp, app)
    return mcp


async def _text(mcp: FastMCP, tool: str, **kwargs: object) -> str:
    result = await mcp.call_tool(tool, kwargs)
    return "".join(getattr(block, "text", "") for block in result.content)


def _mock_migration_prereqs(mock: respx.MockRouter) -> None:
    mock.get("https://canvas.test/api/v1/courses", params={"per_page": "100"}).respond(json=[])
    mock.get("https://canvas.test/api/v1/courses/1").respond(json={"id": 1, "name": "Target"})
    mock.get("https://canvas.test/api/v1/courses/2").respond(json={"id": 2, "name": "Source"})
    for resource in ("modules", "assignments", "pages", "discussion_topics", "files"):
        mock.get(
            f"https://canvas.test/api/v1/courses/1/{resource}", params={"per_page": "100"}
        ).respond(json=[])


async def test_confirmed_write_clears_cache(app: App, mock: respx.MockRouter) -> None:
    _mock_migration_prereqs(mock)
    mock.post("https://canvas.test/api/v1/courses/1/content_migrations").respond(
        json={"id": 55, "workflow_state": "running"}
    )

    mcp = _mcp(app)
    await _text(
        mcp, "create_content_migration", target_course=1, source_course=2, confirm=True
    )
    status_text = await _text(mcp, "get_cache_status")
    await app.aclose()

    status = app.courses.status()
    assert status["cached_courses"] == 0
    assert status["stale"] is True
    assert status["last_invalidated_by"] == "create_content_migration"
    assert "create_content_migration" in status_text


async def test_unconfirmed_write_does_not_clear_cache(app: App, mock: respx.MockRouter) -> None:
    _mock_migration_prereqs(mock)
    # Prime the cache so we can observe it survives the preview call.
    await app.courses.active()

    mcp = _mcp(app)
    text = await _text(
        mcp, "create_content_migration", target_course=1, source_course=2, confirm=False
    )
    await app.aclose()

    assert "preview" in text.lower()
    status = app.courses.status()
    assert status["stale"] is False
    assert status["last_invalidated_by"] is None


async def test_failing_write_does_not_clear_cache(app: App, mock: respx.MockRouter) -> None:
    _mock_migration_prereqs(mock)
    mock.post("https://canvas.test/api/v1/courses/1/content_migrations").respond(
        status_code=422, json={"errors": "nope"}
    )
    await app.courses.active()

    mcp = _mcp(app)
    with pytest.raises(ToolError):
        await mcp.call_tool(
            "create_content_migration",
            {"target_course": 1, "source_course": 2, "confirm": True},
        )
    await app.aclose()

    status = app.courses.status()
    assert status["stale"] is False
    assert status["last_invalidated_by"] is None


async def test_unrelated_write_does_not_clear_cache(app: App, mock: respx.MockRouter) -> None:
    mock.get("https://canvas.test/api/v1/courses", params={"per_page": "100"}).respond(json=[])
    mock.get("https://canvas.test/api/v1/courses/1").respond(json={"id": 1, "name": "Course"})
    mock.post("https://canvas.test/api/v1/courses/1/pages").respond(
        json={"url": "new-page", "title": "Hello", "page_id": 9}
    )
    await app.courses.active()

    mcp = _mcp(app)
    await _text(
        mcp, "create_page", course=1, title="Hello", body="hi", confirm=True
    )
    await app.aclose()

    status = app.courses.status()
    assert status["stale"] is False
    assert status["last_invalidated_by"] is None
