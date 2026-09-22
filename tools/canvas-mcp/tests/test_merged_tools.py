from __future__ import annotations

import pytest
import respx
from fastmcp import Client
from fastmcp.exceptions import ToolError

from canvaslms_api.app import App
from canvaslms_api.server import build_server

BASE = "https://canvas.test/api/v1"


def _mock_course(mock: respx.MockRouter) -> None:
    mock.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Biology", "course_code": "BIO"})


async def _call(app: App, tool: str, args: dict):
    async with Client(build_server(app=app)) as client:
        result = await client.call_tool(tool, args)
    return "\n".join(c.text for c in result.content)


async def test_removed_tools_are_gone(app: App) -> None:
    names = {t.name for t in await build_server(app=app).list_tools()}
    assert not names & {
        "delete_announcement",
        "delete_announcements_matching",
        "get_page_content",
        "get_front_page",
        "list_peer_reviews",
    }
    assert {"delete_announcements", "get_page", "get_peer_review_assignments"} <= names


async def test_delete_announcements_by_id_with_title_guard(app: App, mock: respx.MockRouter) -> None:
    _mock_course(mock)
    mock.get(f"{BASE}/courses/10/discussion_topics/5").respond(json={"id": 5, "title": "Old news"})
    deleted = mock.delete(f"{BASE}/courses/10/discussion_topics/5").respond(json={})
    with pytest.raises(ToolError, match="refusing to delete"):
        await _call(app, "delete_announcements", {"course": 10, "announcement_ids": [5], "require_title_match": "Other", "confirm": True})
    assert not deleted.called
    preview = await _call(app, "delete_announcements", {"course": 10, "announcement_ids": [5]})
    assert "Old news" in preview and not deleted.called
    await _call(app, "delete_announcements", {"course": 10, "announcement_ids": [5], "require_title_match": "Old news", "confirm": True})
    assert deleted.called


async def test_delete_announcements_by_filter(app: App, mock: respx.MockRouter) -> None:
    _mock_course(mock)
    mock.get(f"{BASE}/courses/10/discussion_topics").respond(
        json=[
            {"id": 1, "title": "Snow day", "posted_at": "2026-01-05T00:00:00Z"},
            {"id": 2, "title": "Field trip", "posted_at": "2026-02-01T00:00:00Z"},
        ]
    )
    d1 = mock.delete(f"{BASE}/courses/10/discussion_topics/1").respond(json={})
    d2 = mock.delete(f"{BASE}/courses/10/discussion_topics/2").respond(json={})
    out = await _call(app, "delete_announcements", {"course": 10, "title_contains": "snow", "confirm": True})
    assert "deleted" in out and d1.called and not d2.called


@pytest.mark.parametrize(
    "args,message",
    [
        ({}, "Give announcement_ids"),
        ({"announcement_ids": [1], "title_contains": "x"}, "not both"),
        ({"announcement_ids": [1, 2], "require_title_match": "x"}, "exactly one"),
    ],
)
async def test_delete_announcements_argument_rules(app: App, args: dict, message: str) -> None:
    with pytest.raises(ToolError, match=message):
        await _call(app, "delete_announcements", {"course": 10, **args})


async def test_get_page_returns_metadata_and_full_body(app: App, mock: respx.MockRouter) -> None:
    _mock_course(mock)
    body = "<p>" + "word " * 200 + "</p>"
    mock.get(f"{BASE}/courses/10/pages/intro").respond(json={"title": "Intro", "url": "intro", "body": body})
    out = await _call(app, "get_page", {"course": 10, "page": "intro"})
    assert "**title:** Intro" in out and out.count("word") == 200 and "[truncated" not in out
    capped = await _call(app, "get_page", {"course": 10, "page": "intro", "max_chars": 50})
    assert "[truncated" in capped


async def test_get_page_front_page(app: App, mock: respx.MockRouter) -> None:
    _mock_course(mock)
    front = mock.get(f"{BASE}/courses/10/front_page").respond(json={"title": "Welcome", "body": "<p>Hi</p>"})
    out = await _call(app, "get_page", {"course": 10, "page": "front_page"})
    assert front.called and "Welcome" in out and "Hi" in out
