from __future__ import annotations

import pytest
import respx
from fastmcp import FastMCP

from canvaslms_api.app import App
from canvaslms_api.client import CanvasClient
from canvaslms_api.config import Settings
from canvaslms_api.courses import CourseResolver
from canvaslms_api.tools import discussions, files


@pytest.fixture
def app(settings: Settings) -> App:
    client = CanvasClient(settings)
    return App(settings=settings, client=client, courses=CourseResolver(client, settings.cache_ttl))


def _mcp(app: App, register) -> FastMCP:
    mcp = FastMCP("test")
    register(mcp, app)
    return mcp


async def _text(mcp: FastMCP, tool: str, **kwargs: object) -> str:
    result = await mcp.call_tool(tool, kwargs)
    return "".join(getattr(block, "text", "") for block in result.content)


async def test_list_files_shows_capped_notice_when_capped(
    app: App, mock: respx.MockRouter
) -> None:
    mock.get("https://canvas.test/api/v1/courses/1/folders", params={"per_page": "100"}).respond(
        json=[]
    )
    # get_all's limit=1000 default only reports capped when items reach the
    # limit AND a further `next` link still exists — one page of exactly 1000
    # plus a next link is the minimal case that crosses it.
    page1_next = "https://canvas.test/api/v1/courses/1/files?page=2"
    full_page = [{"id": i, "display_name": f"{i}.txt"} for i in range(1000)]
    mock.get(
        "https://canvas.test/api/v1/courses/1/files",
        params={"per_page": "100", "sort": "name", "order": "asc"},
    ).respond(
        json=full_page,
        headers={"Link": f'<{page1_next}>; rel="next"'},
    )

    mcp = _mcp(app, files.register)
    text = await _text(mcp, "list_files", course=1, sort="name", order="asc")
    await app.aclose()

    assert "capped at 1000" in text


async def test_list_files_omits_capped_notice_when_not_capped(
    app: App, mock: respx.MockRouter
) -> None:
    mock.get("https://canvas.test/api/v1/courses/1/folders", params={"per_page": "100"}).respond(
        json=[]
    )
    mock.get(
        "https://canvas.test/api/v1/courses/1/files",
        params={"per_page": "100", "sort": "name", "order": "asc"},
    ).respond(json=[{"id": 1, "display_name": "a.txt"}])

    mcp = _mcp(app, files.register)
    text = await _text(mcp, "list_files", course=1, sort="name", order="asc")
    await app.aclose()

    assert "capped at 1000" not in text


def _entry(entry_id: int, depth_children: list[dict] | None = None) -> dict:
    return {
        "id": entry_id,
        "user_id": 1,
        "created_at": "2024-01-01T00:00:00Z",
        "message": f"entry {entry_id}",
        "replies": depth_children or [],
    }


async def test_get_discussion_thread_truncation_notice_includes_overage_count(
    app: App, mock: respx.MockRouter
) -> None:
    entries = [_entry(i) for i in range(350)]
    mock.get("https://canvas.test/api/v1/courses/1/discussion_topics/9").respond(
        json={"id": 9, "title": "Topic"}
    )
    mock.get("https://canvas.test/api/v1/courses/1/discussion_topics/9/view").respond(
        json={"participants": [], "view": entries}
    )

    mcp = _mcp(app, discussions.register)
    text = await _text(mcp, "get_discussion_thread", course=1, topic_id=9)
    await app.aclose()

    assert "Showing 300 of 350 entries" in text


async def test_get_discussion_thread_no_truncation_notice_under_limit(
    app: App, mock: respx.MockRouter
) -> None:
    entries = [_entry(i) for i in range(5)]
    mock.get("https://canvas.test/api/v1/courses/1/discussion_topics/9").respond(
        json={"id": 9, "title": "Topic"}
    )
    mock.get("https://canvas.test/api/v1/courses/1/discussion_topics/9/view").respond(
        json={"participants": [], "view": entries}
    )

    mcp = _mcp(app, discussions.register)
    text = await _text(mcp, "get_discussion_thread", course=1, topic_id=9)
    await app.aclose()

    assert "was truncated" not in text
