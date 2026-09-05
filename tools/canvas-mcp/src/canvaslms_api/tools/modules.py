from __future__ import annotations

from typing import Any, Literal

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import DESTRUCTIVE, READ, WRITE, App

# Closed vocabularies are Literal so FastMCP emits a JSON Schema `enum`
# and a client can reject a bad value before the call. Prose in an `Args:`
# block cannot; the model would learn the set by eating a ToolError.
# Runtime checks are kept — a schema binds a well-behaved client only.
ItemType = Literal["File", "Discussion", "Assignment", "Quiz", "SubHeader", "ExternalUrl", "Page"]

# Canvas accepts more item types than the four this server creates directly;
# CONTENT_TYPES stays the narrower create-time set it always was.
CONTENT_TYPES = {"File", "Discussion", "Assignment", "Quiz"}


def _requirement(item: dict[str, Any]) -> str:
    req = item.get("completion_requirement")
    if not req:
        return md.NONE
    label = req.get("type") or ""
    if req.get("min_score") is not None:
        label = f"{label} ({req['min_score']})"
    return f"{label}: {'done' if req.get('completed') else 'not done'}"


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_modules(
        course: str | int, include_items: bool = False, search_term: str | None = None
    ) -> str:
        """List a course's modules with state, publish status, and item counts.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            include_items: Also list each module's items nested beneath it.
            search_term: Filter modules by name.
        """
        cid = await app.course_id(course)
        params: dict[str, Any] = {}
        if include_items:
            params["include[]"] = ["items"]
        if search_term:
            params["search_term"] = search_term
        modules = await app.client.get_all(f"/courses/{cid}/modules", params)

        rows = [
            (
                m.get("id"),
                m.get("name"),
                m.get("position"),
                m.get("published"),
                m.get("state"),
                m.get("items_count"),
                md.fmt_date(m.get("unlock_at")),
            )
            for m in modules
        ]
        table = md.table(["id", "name", "position", "published", "state", "items", "unlock"], rows)
        if modules.capped:
            table += f"\n\n{md.capped_notice(len(modules))}"
        if not include_items:
            return table

        blocks = [table]
        for m in modules:
            items = m.get("items") or []
            lines = [
                f"{item.get('type')}: {item.get('title')}"
                + (" (done)" if (item.get("completion_requirement") or {}).get("completed") else "")
                for item in items
            ]
            blocks.append(md.section(m.get("name") or str(m.get("id")), md.bullets(lines), level=3))
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def list_module_items(
        course: str | int, module_id: str | int, include_content_details: bool = False
    ) -> str:
        """List the items inside one module.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            module_id: Canvas module id.
            include_content_details: Also fetch due date and points possible per item.
        """
        cid = await app.course_id(course)
        params: dict[str, Any] = {}
        if include_content_details:
            params["include[]"] = ["content_details"]
        items = await app.client.get_all(f"/courses/{cid}/modules/{module_id}/items", params)

        headers = ["id", "position", "type", "title", "published", "requirement"]
        if include_content_details:
            headers += ["due", "points"]
        headers.append("url")

        rows = []
        for item in items:
            details = item.get("content_details") or {}
            row = [
                item.get("id"),
                item.get("position"),
                item.get("type"),
                item.get("title"),
                item.get("published"),
                _requirement(item),
            ]
            if include_content_details:
                row += [md.fmt_date(details.get("due_at")), details.get("points_possible")]
            row.append(item.get("html_url") or item.get("external_url") or md.NONE)
            rows.append(row)
        table = md.table(headers, rows)
        if items.capped:
            table += f"\n\n{md.capped_notice(len(items))}"
        return table

    @mcp.tool(annotations=WRITE)
    async def create_module(
        course: str | int,
        name: str,
        position: int | None = None,
        unlock_at: str | None = None,
        require_sequential_progress: bool = False,
        prerequisite_module_ids: list[int] | None = None,
        published: bool = False,
        confirm: bool = False,
    ) -> str:
        """Create a new module in a course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            name: Module name.
            position: Position in the module list (1-indexed).
            unlock_at: ISO 8601 timestamp when the module unlocks.
            require_sequential_progress: Require items to be completed in order.
            prerequisite_module_ids: Module ids that must be completed first.
            published: Whether the module should be published.
            confirm: Must be true to create the module; otherwise returns a preview.
        """
        if not name.strip():
            raise ToolError("name cannot be empty.")
        cid = await app.course_id(course)

        details = md.kv(
            [
                ("course", await app.course_name(cid)),
                ("name", name),
                ("position", position),
                ("unlock at", unlock_at),
                ("require sequential progress", require_sequential_progress),
                ("prerequisite module ids", prerequisite_module_ids),
                ("published", published),
            ]
        )
        if not confirm:
            return md.preview("create_module", details)

        payload: dict[str, Any] = {"name": name, "require_sequential_progress": require_sequential_progress}
        if position is not None:
            payload["position"] = position
        if unlock_at is not None:
            payload["unlock_at"] = unlock_at
        if prerequisite_module_ids is not None:
            payload["prerequisite_module_ids"] = prerequisite_module_ids
        if published:
            payload["published"] = True

        created = await app.client.post(f"/courses/{cid}/modules", json={"module": payload})

        note = ""
        if published and not created.get("published"):
            created = await app.client.put(
                f"/courses/{cid}/modules/{created['id']}", json={"module": {"published": True}}
            )
            note = " (published via follow-up update; Canvas ignored it on create)"

        return md.done(
            "create_module",
            md.kv(
                [
                    ("id", created.get("id")),
                    ("name", created.get("name")),
                    ("position", created.get("position")),
                    ("published", str(created.get("published")) + note),
                ]
            ),
        )

    @mcp.tool(annotations=WRITE)
    async def update_module(
        course: str | int,
        module_id: str | int,
        name: str | None = None,
        position: int | None = None,
        unlock_at: str | None = None,
        require_sequential_progress: bool | None = None,
        prerequisite_module_ids: list[int] | None = None,
        published: bool | None = None,
        confirm: bool = False,
    ) -> str:
        """Update an existing module's settings. Only given fields are changed.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            module_id: Canvas module id.
            name: New module name.
            position: New position in the module list.
            unlock_at: New ISO 8601 unlock timestamp.
            require_sequential_progress: Require items to be completed in order.
            prerequisite_module_ids: Replace prerequisite module ids (pass [] to clear).
            published: Publish or unpublish the module.
            confirm: Must be true to apply the update; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        current = await app.client.get(f"/courses/{cid}/modules/{module_id}")

        fields: dict[str, Any] = {}
        if name is not None:
            fields["name"] = name
        if position is not None:
            fields["position"] = position
        if unlock_at is not None:
            fields["unlock_at"] = unlock_at
        if require_sequential_progress is not None:
            fields["require_sequential_progress"] = require_sequential_progress
        if prerequisite_module_ids is not None:
            fields["prerequisite_module_ids"] = prerequisite_module_ids
        if published is not None:
            fields["published"] = published

        if not fields:
            raise ToolError("No fields given to update.")

        changes = [
            (key, current.get(key), value) for key, value in fields.items()
        ]
        details = md.table(["field", "before", "after"], changes)
        if not confirm:
            return md.preview("update_module", details)

        updated = await app.client.put(f"/courses/{cid}/modules/{module_id}", json={"module": fields})
        return md.done("update_module", details=md.kv([("id", updated.get("id")), ("name", updated.get("name"))]))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_module(course: str | int, module_id: str | int, confirm: bool = False) -> str:
        """Delete a module from a course. The module's content items are not deleted.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            module_id: Canvas module id.
            confirm: Must be true to delete; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        current = await app.client.get(f"/courses/{cid}/modules/{module_id}")
        details = md.kv(
            [
                ("module", current.get("name")),
                ("items", current.get("items_count")),
            ]
        )
        if not confirm:
            return md.preview("delete_module", details)

        await app.client.delete(f"/courses/{cid}/modules/{module_id}")
        return md.done("delete_module", details)

    @mcp.tool(annotations=WRITE)
    async def add_module_item(
        course: str | int,
        module_id: str | int,
        item_type: ItemType,
        content_id: str | int | None = None,
        title: str | None = None,
        position: int | None = None,
        indent: int | None = None,
        page_url: str | None = None,
        external_url: str | None = None,
        new_tab: bool = False,
        completion_requirement_type: str | None = None,
        completion_requirement_min_score: int | None = None,
        confirm: bool = False,
    ) -> str:
        """Add an item to a module.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            module_id: Canvas module id to add the item to.
            item_type: One of File, Page, Discussion, Assignment, Quiz, SubHeader, ExternalUrl, ExternalTool.
            content_id: Id of the linked content; required for File, Discussion, Assignment, Quiz.
            title: Item title; required for SubHeader, optional label override otherwise.
            position: Position within the module (1-indexed).
            indent: Visual indent level (0-based).
            page_url: Page url slug; required for Page items.
            external_url: Target URL; required for ExternalUrl and ExternalTool items.
            new_tab: Open ExternalUrl/ExternalTool items in a new tab.
            completion_requirement_type: One of must_view, must_submit, must_contribute, min_score, must_mark_done.
            completion_requirement_min_score: Minimum score, required when completion_requirement_type is min_score.
            confirm: Must be true to add the item; otherwise returns a preview.
        """
        valid_types = {"File", "Page", "Discussion", "Assignment", "Quiz", "SubHeader", "ExternalUrl", "ExternalTool"}
        if item_type not in valid_types:
            raise ToolError(f"item_type must be one of {sorted(valid_types)}.")
        if item_type in CONTENT_TYPES and content_id is None:
            raise ToolError(f"{item_type} items require content_id.")
        if item_type == "Page" and not page_url:
            raise ToolError("Page items require page_url.")
        if item_type in ("ExternalUrl", "ExternalTool") and not external_url:
            raise ToolError(f"{item_type} items require external_url.")
        if item_type == "SubHeader" and not title:
            raise ToolError("SubHeader items require title.")

        cid = await app.course_id(course)

        payload: dict[str, Any] = {"type": item_type}
        if content_id is not None:
            payload["content_id"] = content_id
        if title is not None:
            payload["title"] = title
        if position is not None:
            payload["position"] = position
        if indent is not None:
            payload["indent"] = indent
        if page_url is not None:
            payload["page_url"] = page_url
        if external_url is not None:
            payload["external_url"] = external_url
        if item_type in ("ExternalUrl", "ExternalTool"):
            payload["new_tab"] = new_tab
        if completion_requirement_type is not None:
            requirement: dict[str, Any] = {"type": completion_requirement_type}
            if completion_requirement_type == "min_score":
                if completion_requirement_min_score is None:
                    raise ToolError("completion_requirement_min_score is required for min_score.")
                requirement["min_score"] = completion_requirement_min_score
            payload["completion_requirement"] = requirement

        details = md.kv(
            [
                ("course", await app.course_name(cid)),
                ("module id", module_id),
                ("type", item_type),
                ("content id", content_id),
                ("title", title),
                ("page url", page_url),
                ("external url", external_url),
                ("position", position),
            ]
        )
        if not confirm:
            return md.preview("add_module_item", details)

        created = await app.client.post(
            f"/courses/{cid}/modules/{module_id}/items", json={"module_item": payload}
        )
        return md.done(
            "add_module_item",
            md.kv([("id", created.get("id")), ("title", created.get("title")), ("type", created.get("type"))]),
        )

    @mcp.tool(annotations=WRITE)
    async def update_module_item(
        course: str | int,
        module_id: str | int,
        item_id: str | int,
        title: str | None = None,
        position: int | None = None,
        indent: int | None = None,
        external_url: str | None = None,
        new_tab: bool | None = None,
        completion_requirement_type: str | None = None,
        completion_requirement_min_score: int | None = None,
        published: bool | None = None,
        move_to_module_id: str | int | None = None,
        confirm: bool = False,
    ) -> str:
        """Update an existing module item. Only given fields are changed.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            module_id: Canvas module id containing the item.
            item_id: Canvas module item id.
            title: New item title.
            position: New position within the module.
            indent: New visual indent level.
            external_url: New target URL, for ExternalUrl/ExternalTool items.
            new_tab: Open in a new tab, for ExternalUrl/ExternalTool items.
            completion_requirement_type: One of must_view, must_submit, must_contribute, min_score, must_mark_done.
            completion_requirement_min_score: Minimum score, required when completion_requirement_type is min_score.
            published: Publish or unpublish the item.
            move_to_module_id: Move the item to a different module id.
            confirm: Must be true to apply the update; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        current = await app.client.get(f"/courses/{cid}/modules/{module_id}/items/{item_id}")

        fields: dict[str, Any] = {}
        if title is not None:
            fields["title"] = title
        if position is not None:
            fields["position"] = position
        if indent is not None:
            fields["indent"] = indent
        if external_url is not None:
            fields["external_url"] = external_url
        if new_tab is not None:
            fields["new_tab"] = new_tab
        if published is not None:
            fields["published"] = published
        if move_to_module_id is not None:
            fields["module_id"] = move_to_module_id
        if completion_requirement_type is not None:
            requirement: dict[str, Any] = {"type": completion_requirement_type}
            if completion_requirement_type == "min_score":
                if completion_requirement_min_score is None:
                    raise ToolError("completion_requirement_min_score is required for min_score.")
                requirement["min_score"] = completion_requirement_min_score
            fields["completion_requirement"] = requirement

        if not fields:
            raise ToolError("No fields given to update.")

        details = md.kv(
            [
                ("item", current.get("title")),
                *[(key, value) for key, value in fields.items() if key != "completion_requirement"],
            ]
        )
        if not confirm:
            return md.preview("update_module_item", details)

        updated = await app.client.put(
            f"/courses/{cid}/modules/{module_id}/items/{item_id}", json={"module_item": fields}
        )
        return md.done("update_module_item", md.kv([("id", updated.get("id")), ("title", updated.get("title"))]))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_module_item(
        course: str | int, module_id: str | int, item_id: str | int, confirm: bool = False
    ) -> str:
        """Remove an item from a module. The underlying content is not deleted.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            module_id: Canvas module id containing the item.
            item_id: Canvas module item id.
            confirm: Must be true to remove the item; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        current = await app.client.get(f"/courses/{cid}/modules/{module_id}/items/{item_id}")
        details = md.kv([("item", current.get("title")), ("type", current.get("type"))])
        if not confirm:
            return md.preview("delete_module_item", details)

        await app.client.delete(f"/courses/{cid}/modules/{module_id}/items/{item_id}")
        return md.done("delete_module_item", details)
