from __future__ import annotations

from fastmcp import FastMCP

from .. import md
from ..app import READ, App

GROUP_KEYWORDS: list[tuple[str, list[str]]] = [
    ("accessibility", ["accessib", "ufixit", "wcag"]),
    ("migrations", ["migration"]),
    ("peer reviews", ["peer_review", "peer reviews", "peer review"]),
    ("rubrics", ["rubric"]),
    ("people", ["user", "group", "enrollment", "person", "anonymiz", "privacy"]),
    ("announcements", ["announcement"]),
    ("discussions", ["discussion", "topic", "entry", "reply"]),
    ("modules", ["module"]),
    ("pages", ["page", "front_page"]),
    ("files", ["file", "upload", "download"]),
    ("messages", ["conversation", "message", "inbox"]),
    ("grades", ["grade", "score", "submission"]),
    ("assignments", ["assignment"]),
    ("courses", ["course", "syllabus", "cache"]),
]


def _group_for(name: str, description: str) -> str:
    name_lower = name.lower()
    for group, keywords in GROUP_KEYWORDS:
        if any(keyword in name_lower for keyword in keywords):
            return group
    description_lower = description.lower()
    for group, keywords in GROUP_KEYWORDS:
        if any(keyword in description_lower for keyword in keywords):
            return group
    return "other"


def _first_sentence(description: str) -> str:
    text = (description or "").strip().splitlines()[0] if description else ""
    if "." in text:
        return text.split(".", 1)[0].strip() + "."
    return text


def _param_lines(schema: dict) -> list[str]:
    properties = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    lines = []
    for name, prop in properties.items():
        type_name = prop.get("type") or "any"
        if isinstance(type_name, list):
            type_name = " | ".join(type_name)
        marker = "required" if name in required else "optional"
        lines.append(f"{name}: {type_name} ({marker})")
    return lines


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def search_tools(query: str | None = None, detail_level: str = "brief") -> str:
        """Search this server's own registered MCP tools by name and description keyword.

        Args:
            query: Case-insensitive search term matched against tool name and description
                words. Omit to list every registered tool, grouped by area.
            detail_level: "brief" (name + one-sentence description) or "full" (also
                parameters and whether the tool requires confirm).
        """
        if detail_level not in ("brief", "full"):
            detail_level = "brief"

        tools = await mcp.list_tools()
        needle = (query or "").strip().casefold()

        matched = []
        for tool in tools:
            description = tool.description or ""
            if not needle:
                matched.append(tool)
                continue
            haystack = f"{tool.name} {description}".casefold()
            if needle in haystack or any(needle in word for word in haystack.split()):
                matched.append(tool)

        grouped: dict[str, list] = {}
        for tool in matched:
            group = _group_for(tool.name, tool.description or "")
            grouped.setdefault(group, []).append(tool)

        if not grouped:
            return f"No tools matched {query!r}."

        blocks = []
        for group in sorted(grouped):
            group_tools = sorted(grouped[group], key=lambda t: t.name)
            lines = []
            for tool in group_tools:
                description = tool.description or ""
                summary = _first_sentence(description)
                if detail_level == "brief":
                    lines.append(f"- **{tool.name}**: {summary}")
                    continue
                schema = tool.parameters or {}
                params = _param_lines(schema)
                needs_confirm = "confirm" in (schema.get("properties") or {})
                lines.append(f"- **{tool.name}**: {summary}")
                if params:
                    lines.append("  - " + "; ".join(params))
                lines.append(f"  - requires confirm: {'yes' if needs_confirm else 'no'}")
            blocks.append(md.section(f"{group} ({len(group_tools)})", "\n".join(lines), level=3))

        return md.join(f"Matched {len(matched)} of {len(tools)} tools.", *blocks)
