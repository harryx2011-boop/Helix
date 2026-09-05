from __future__ import annotations

import asyncio
from typing import Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import DESTRUCTIVE, READ, WRITE, App

BULK_CAP = 50


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_pages(
        course: str | int,
        sort: str = "title",
        order: str = "asc",
        search_term: str | None = None,
        published: bool | None = None,
    ) -> str:
        """List a course's pages.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            sort: Sort field: title, created_at, or updated_at.
            order: Sort order: asc or desc.
            search_term: Filter pages by title.
            published: Restrict to published (true) or unpublished (false) pages.
        """
        valid_sorts = {"title", "created_at", "updated_at"}
        if sort not in valid_sorts:
            raise ToolError(f"sort must be one of {sorted(valid_sorts)}.")
        if order not in {"asc", "desc"}:
            raise ToolError("order must be 'asc' or 'desc'.")

        cid = await app.course_id(course)
        params: dict[str, Any] = {"sort": sort, "order": order}
        if search_term:
            params["search_term"] = search_term
        if published is not None:
            params["published"] = published

        pages = await app.client.get_all(f"/courses/{cid}/pages", params)
        rows = [
            (
                p.get("url"),
                p.get("title"),
                md.fmt_date(p.get("updated_at")),
                p.get("published"),
                p.get("front_page"),
            )
            for p in pages
        ]
        table = md.table(["url", "title", "updated", "published", "front page"], rows)
        if pages.capped:
            table += f"\n\n{md.capped_notice(len(pages))}"
        return table

    @mcp.tool(annotations=READ)
    async def get_page(course: str | int, page: str) -> str:
        """Get one page's metadata and a short body preview.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            page: The page's url slug or numeric page id.
        """
        cid = await app.course_id(course)
        data = await app.client.get(f"/courses/{cid}/pages/{page}")
        body = md.kv(
            [
                ("title", data.get("title")),
                ("url", data.get("url")),
                ("id", data.get("page_id")),
                ("created", md.fmt_date(data.get("created_at"))),
                ("updated", md.fmt_date(data.get("updated_at"))),
                ("published", data.get("published")),
                ("front page", data.get("front_page")),
                ("editing roles", data.get("editing_roles")),
                ("last edited by", app.person(data.get("last_edited_by"))),
                ("locked for you", data.get("locked_for_user")),
            ]
        )
        preview = md.html_to_text(data.get("body"), 300)
        return md.join(body, md.section("Body preview", preview or "_empty_"))

    @mcp.tool(annotations=READ)
    async def get_page_content(course: str | int, page: str, max_chars: int | None = None) -> str:
        """Get a page's full body as text, untruncated unless max_chars is given.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            page: The page's url slug or numeric page id.
            max_chars: Optional cap on returned characters; truncation is marked explicitly.
        """
        cid = await app.course_id(course)
        data = await app.client.get(f"/courses/{cid}/pages/{page}")
        full_text = md.html_to_text(data.get("body"))
        text = md.truncate(full_text, max_chars) if max_chars else full_text
        return f"{text}\n\n[{len(full_text)} characters]"

    @mcp.tool(annotations=READ)
    async def get_front_page(course: str | int) -> str:
        """Get the course's front page: title and full body text.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
        """
        cid = await app.course_id(course)
        data = await app.client.get(f"/courses/{cid}/front_page")
        text = md.html_to_text(data.get("body"), 6000)
        return md.join(md.heading(data.get("title") or "Front page"), text or "_empty_")

    @mcp.tool(annotations=WRITE)
    async def create_page(
        course: str | int,
        title: str,
        body: str,
        published: bool = False,
        front_page: bool = False,
        editing_roles: str | None = None,
        confirm: bool = False,
    ) -> str:
        """Create a new page in a course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            title: Page title.
            body: Page body as HTML. Plain text is accepted and wrapped in a paragraph.
            published: Whether the page should be published.
            front_page: Whether to set this page as the course front page.
            editing_roles: Who can edit the page, e.g. "teachers", "students", "public".
            confirm: Must be true to create the page; otherwise returns a preview.
        """
        if not title.strip():
            raise ToolError("title cannot be empty.")
        cid = await app.course_id(course)

        html_body = body if "<" in body else f"<p>{body}</p>"
        details = md.kv(
            [
                ("course", await app.course_name(cid)),
                ("title", title),
                ("published", published),
                ("front page", front_page),
                ("editing roles", editing_roles),
                ("body preview", md.truncate(md.html_to_text(html_body), 300)),
            ]
        )
        if not confirm:
            return md.preview("create_page", details)

        payload: dict[str, Any] = {"title": title, "body": html_body, "published": published}
        if front_page:
            payload["front_page"] = True
        if editing_roles is not None:
            payload["editing_roles"] = editing_roles

        created = await app.client.post(f"/courses/{cid}/pages", json={"wiki_page": payload})
        return md.done(
            "create_page",
            md.kv([("url", created.get("url")), ("title", created.get("title")), ("id", created.get("page_id"))]),
        )

    @mcp.tool(annotations=WRITE)
    async def edit_page_content(
        course: str | int, page: str, body: str, title: str | None = None, confirm: bool = False
    ) -> str:
        """Replace a page's body content.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            page: The page's url slug or numeric page id.
            body: New page body as HTML. Plain text is accepted and wrapped in a paragraph.
            title: Optionally rename the page at the same time.
            confirm: Must be true to save the change; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        current = await app.client.get(f"/courses/{cid}/pages/{page}")
        current_body = current.get("body") or ""
        html_body = body if "<" in body else f"<p>{body}</p>"

        details = md.kv(
            [
                ("page", current.get("title")),
                ("new title", title or "(unchanged)"),
                ("current body length", len(current_body)),
                ("new body length", len(html_body)),
                ("new body preview", md.truncate(md.html_to_text(html_body), 300)),
            ]
        )
        if not confirm:
            return md.preview("edit_page_content", details)

        payload: dict[str, Any] = {"body": html_body}
        if title is not None:
            payload["title"] = title

        updated = await app.client.put(f"/courses/{cid}/pages/{page}", json={"wiki_page": payload})
        return md.done("edit_page_content", md.kv([("title", updated.get("title")), ("url", updated.get("url"))]))

    @mcp.tool(annotations=WRITE)
    async def update_page_settings(
        course: str | int,
        page: str,
        published: bool | None = None,
        front_page: bool | None = None,
        editing_roles: str | None = None,
        notify_of_update: bool | None = None,
        confirm: bool = False,
    ) -> str:
        """Update a page's settings without changing its content.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            page: The page's url slug or numeric page id.
            published: Publish or unpublish the page.
            front_page: Set or unset this page as the course front page.
            editing_roles: Who can edit the page, e.g. "teachers", "students", "public".
            notify_of_update: Notify students that the page changed.
            confirm: Must be true to apply the update; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        current = await app.client.get(f"/courses/{cid}/pages/{page}")

        fields: dict[str, Any] = {}
        if published is not None:
            fields["published"] = published
        if front_page is not None:
            fields["front_page"] = front_page
        if editing_roles is not None:
            fields["editing_roles"] = editing_roles
        if notify_of_update is not None:
            fields["notify_of_update"] = notify_of_update

        if not fields:
            raise ToolError("No fields given to update.")

        changes = [
            (key, current.get(key), value) for key, value in fields.items() if key != "notify_of_update"
        ]
        if "notify_of_update" in fields:
            changes.append(("notify_of_update", md.NONE, fields["notify_of_update"]))
        details = md.table(["field", "before", "after"], changes)
        if not confirm:
            return md.preview("update_page_settings", details)

        updated = await app.client.put(f"/courses/{cid}/pages/{page}", json={"wiki_page": fields})
        return md.done("update_page_settings", md.kv([("title", updated.get("title")), ("url", updated.get("url"))]))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def bulk_update_pages(
        course: str | int,
        pages: list[str],
        published: bool | None = None,
        editing_roles: str | None = None,
        notify_of_update: bool | None = None,
        confirm: bool = False,
    ) -> str:
        """Apply the same settings change to multiple pages at once.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            pages: List of page url slugs or numeric page ids, up to 50.
            published: Publish or unpublish all listed pages.
            editing_roles: Set editing roles on all listed pages.
            notify_of_update: Notify students of the change on all listed pages.
            confirm: Must be true to apply the change; otherwise returns a preview.
        """
        if not pages:
            raise ToolError("pages cannot be empty.")
        if len(pages) > BULK_CAP:
            raise ToolError(f"pages cannot exceed {BULK_CAP} at once (got {len(pages)}).")

        fields: dict[str, Any] = {}
        if published is not None:
            fields["published"] = published
        if editing_roles is not None:
            fields["editing_roles"] = editing_roles
        if notify_of_update is not None:
            fields["notify_of_update"] = notify_of_update
        if not fields:
            raise ToolError("No fields given to update.")

        cid = await app.course_id(course)
        current_pages = await app.client.gather(app.client.get(f"/courses/{cid}/pages/{p}") for p in pages)

        if not confirm:
            rows = [
                (
                    p,
                    current.get("title"),
                    current.get("published"),
                    fields.get("published", "(unchanged)"),
                    current.get("editing_roles"),
                    fields.get("editing_roles", "(unchanged)"),
                )
                for p, current in zip(pages, current_pages, strict=True)
            ]
            details = md.table(
                ["page", "title", "published now", "published after", "roles now", "roles after"], rows
            )
            return md.preview("bulk_update_pages", details)

        async def apply(p: str) -> Any:
            # Up to 50 pages updated concurrently behind the semaphore; give the batch
            # more room than a single-page request's 30s default.
            return await app.client.put(
                f"/courses/{cid}/pages/{p}", json={"wiki_page": fields}, timeout=90.0
            )

        outcomes = await asyncio.gather(*(apply(p) for p in pages), return_exceptions=True)
        rows = []
        for p, outcome in zip(pages, outcomes, strict=True):
            if isinstance(outcome, Exception):
                rows.append((p, "failed", str(outcome)))
            else:
                rows.append((p, "updated", outcome.get("title")))
        return md.done("bulk_update_pages", md.table(["page", "result", "detail"], rows))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_page(
        course: str | int, page: str, require_title_match: str | None = None, confirm: bool = False
    ) -> str:
        """Delete a page from a course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            page: The page's url slug or numeric page id.
            require_title_match: If given, the delete is refused unless it exactly matches the page's title.
            confirm: Must be true to delete; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        current = await app.client.get(f"/courses/{cid}/pages/{page}")
        actual_title = current.get("title") or ""

        if require_title_match is not None and require_title_match != actual_title:
            raise ToolError(
                f"require_title_match {require_title_match!r} does not match the page's actual "
                f"title {actual_title!r}. Refusing to delete."
            )

        details = md.kv([("title", actual_title), ("url", current.get("url"))])
        if not confirm:
            return md.preview("delete_page", details)

        await app.client.delete(f"/courses/{cid}/pages/{page}")
        return md.done("delete_page", details)
