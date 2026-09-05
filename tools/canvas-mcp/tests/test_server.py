from __future__ import annotations

import re

import pytest

from canvaslms_api.app import App
from canvaslms_api.client import CanvasClient
from canvaslms_api.config import Settings
from canvaslms_api.courses import CourseResolver

NAME_RE = re.compile(r"^[a-z][a-z0-9_]+$")
WRITE_CONFIRM_ALLOWLIST = {"clear_cache", "download_file"}
MIN_TOOL_COUNT = 90


@pytest.fixture
def app(settings: Settings) -> App:
    client = CanvasClient(settings)
    return App(settings=settings, client=client, courses=CourseResolver(client, settings.cache_ttl))


async def _list_tools(app: App):
    from canvaslms_api.server import build_server

    server = build_server(app=app)
    try:
        return await server.list_tools()
    finally:
        await app.aclose()


async def test_tool_names_unique_and_well_formed(app: App) -> None:
    tools = await _list_tools(app)
    names = [t.name for t in tools]
    assert len(names) == len(set(names)), "duplicate tool names registered"
    malformed = [n for n in names if not NAME_RE.match(n)]
    assert not malformed, f"tool names violating ^[a-z][a-z0-9_]+$: {malformed}"


async def test_write_tools_have_confirm_parameter(app: App) -> None:
    tools = await _list_tools(app)
    violations = []
    for tool in tools:
        if tool.name in WRITE_CONFIRM_ALLOWLIST:
            continue
        read_only = bool(getattr(tool.annotations, "readOnlyHint", None)) if tool.annotations else False
        if read_only:
            continue
        props = (tool.parameters or {}).get("properties", {})
        confirm = props.get("confirm")
        if not confirm or confirm.get("type") != "boolean" or confirm.get("default") is not False:
            violations.append(tool.name)
    assert not violations, f"write tools missing a `confirm: bool = False` parameter: {violations}"


async def test_every_tool_has_non_empty_description(app: App) -> None:
    tools = await _list_tools(app)
    empty = [t.name for t in tools if not (t.description or "").strip()]
    assert not empty, f"tools with empty description: {empty}"


async def test_tool_count_parity_gate(app: App) -> None:
    tools = await _list_tools(app)
    assert len(tools) >= MIN_TOOL_COUNT, (
        f"expected at least {MIN_TOOL_COUNT} registered tools once all tool modules land, "
        f"found {len(tools)}. This gate tracks parity with the full tool surface and is "
        f"expected to fail while sibling tool modules are still being written."
    )
