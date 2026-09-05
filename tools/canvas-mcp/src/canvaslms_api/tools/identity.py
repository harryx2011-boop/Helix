from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from .. import md
from ..app import READ, WRITE, App


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def get_profile() -> str:
        """Get your own Canvas identity.

        Returns your Canvas user id, name, login id, time zone, and primary
        email if Canvas exposes one.
        """
        profile = await app.client.get("/users/self/profile")
        return md.kv(
            [
                ("id", profile.get("id")),
                ("name", profile.get("name")),
                ("login id", profile.get("login_id")),
                ("time zone", profile.get("time_zone")),
                ("email", profile.get("primary_email") or profile.get("email")),
            ]
        )

    @mcp.tool(annotations=READ)
    async def get_enrollments(include_concluded: bool = False) -> str:
        """List the courses you are enrolled in, with your role in each.

        Args:
            include_concluded: Also include concluded/completed enrollments.
        """
        params: dict[str, Any] = {"include[]": ["course"]}
        if not include_concluded:
            params["state[]"] = ["active", "invited"]
        enrollments = await app.client.get_all("/users/self/enrollments", params)
        known = {c["id"]: c for c in await app.courses.active()}
        by_course: dict[int, dict[str, Any]] = {}
        for enrollment in enrollments:
            course = enrollment.get("course") or known.get(enrollment.get("course_id")) or {}
            cid = enrollment.get("course_id")
            entry = by_course.setdefault(
                cid,
                {
                    "name": course.get("name") or str(cid),
                    "code": course.get("course_code"),
                    "roles": [],
                    "state": enrollment.get("enrollment_state"),
                },
            )
            entry["roles"].append(enrollment.get("type") or enrollment.get("role"))
        rows = [
            (entry["name"], entry["code"], cid, ", ".join(sorted(set(entry["roles"]))), entry["state"])
            for cid, entry in by_course.items()
        ]
        table = md.table(["course", "code", "id", "role(s)", "state"], rows)
        if enrollments.capped:
            table += f"\n\n{md.capped_notice(len(enrollments))}"
        return table

    @mcp.tool(annotations=READ)
    async def list_courses() -> str:
        """List your active courses with current score and grade."""
        courses = await app.courses.active()
        rows = []
        for course in courses:
            enrollment = next(iter(course.get("enrollments") or []), {})
            rows.append(
                (
                    course.get("name"),
                    course.get("course_code"),
                    course.get("id"),
                    (course.get("term") or {}).get("name"),
                    enrollment.get("computed_current_score"),
                    enrollment.get("computed_current_grade"),
                )
            )
        table = md.table(["name", "code", "id", "term", "score", "grade"], rows)
        if courses.capped:
            table += f"\n\n{md.capped_notice(len(courses))}"
        return table

    @mcp.tool(annotations=READ)
    async def get_course(course: str | int) -> str:
        """Get course details: identity, term, dates, your role, grade, syllabus preview.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
        """
        details = await app.courses.get(course, include=["syllabus_body", "term", "total_scores"])
        enrollment = next(iter(details.get("enrollments") or []), {})
        body = md.kv(
            [
                ("name", details.get("name")),
                ("code", details.get("course_code")),
                ("id", details.get("id")),
                ("term", (details.get("term") or {}).get("name")),
                ("start", md.fmt_date(details.get("start_at"))),
                ("end", md.fmt_date(details.get("end_at"))),
                ("your role", enrollment.get("type") or enrollment.get("role")),
                ("current grade", enrollment.get("computed_current_grade")),
                ("current score", enrollment.get("computed_current_score")),
            ]
        )
        syllabus = md.html_to_text(details.get("syllabus_body"), 1500)
        return md.join(body, md.section("Syllabus preview", syllabus or "_none_"))

    @mcp.tool(annotations=READ)
    async def get_syllabus(course: str | int, max_chars: int | None = None) -> str:
        """Get the full syllabus text for a course, untruncated unless max_chars is given.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            max_chars: Optional cap on returned characters; truncation is marked explicitly.
        """
        details = await app.courses.get(course, include=["syllabus_body"])
        text = md.html_to_text(details.get("syllabus_body"), max_chars)
        return text or "_no syllabus content_"

    @mcp.tool(annotations=READ)
    async def get_course_overview(
        course: str | int,
        include_pages: bool = True,
        include_modules: bool = True,
        include_syllabus: bool = True,
    ) -> str:
        """Get a one-call overview of a course: syllabus preview, modules, and pages.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            include_pages: Include the list of course pages.
            include_modules: Include the module list with item counts.
            include_syllabus: Include a syllabus preview.
        """
        cid = await app.course_id(course)
        blocks = [md.heading(await app.course_name(cid), 1)]

        if include_syllabus:
            details = await app.client.get(f"/courses/{cid}", {"include[]": ["syllabus_body"]})
            preview = md.html_to_text(details.get("syllabus_body"), 1500)
            blocks.append(md.section("Syllabus preview", preview or "_none_"))

        if include_modules:
            modules = await app.client.get_all(f"/courses/{cid}/modules", {"include[]": ["items"]})
            rows = [
                (m.get("name"), m.get("state"), len(m.get("items") or []))
                for m in modules
            ]
            table = md.table(["module", "state", "items"], rows)
            if modules.capped:
                table += f"\n\n{md.capped_notice(len(modules))}"
            blocks.append(md.section("Modules", table))

        if include_pages:
            pages = await app.client.get_all(f"/courses/{cid}/pages")
            rows = [(p.get("title"), p.get("url"), p.get("published")) for p in pages]
            table = md.table(["title", "url", "published"], rows)
            if pages.capped:
                table += f"\n\n{md.capped_notice(len(pages))}"
            blocks.append(md.section("Pages", table))

        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def get_course_structure(course: str | int, include_unpublished: bool = False) -> str:
        """Get the full module -> item tree for a course.

        Students never see unpublished modules or items regardless of this flag;
        it is kept for parity with educator tokens.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            include_unpublished: Request unpublished modules/items too (ignored where Canvas hides them).
        """
        cid = await app.course_id(course)
        modules = await app.client.get_all(f"/courses/{cid}/modules", {"include[]": ["items"]})
        blocks = [md.heading(await app.course_name(cid), 1)]
        for module in modules:
            items = module.get("items")
            if items is None:
                items = await app.client.get_all(f"/courses/{cid}/modules/{module['id']}/items")
            item_lines = [
                f"{item.get('type')}: {item.get('title')} "
                f"(published: {item.get('published')}, url: {item.get('html_url') or '-'})"
                for item in items
            ]
            header = f"{module.get('name')} (state: {module.get('state')}, items: {len(items)})"
            body = md.bullets(item_lines) if item_lines else "_no items_"
            if getattr(items, "capped", False):
                body += f"\n\n{md.capped_notice(len(items))}"
            blocks.append(md.section(header, body, level=3))
        if modules.capped:
            blocks.append(md.capped_notice(len(modules)))
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def get_cache_status() -> str:
        """Report the course-code cache's size, age, and TTL for diagnostics."""
        return md.kv(app.courses.status().items())

    @mcp.tool(annotations=WRITE)
    async def clear_cache() -> str:
        """Clear the course-code cache, forcing a fresh fetch on the next course lookup.

        This only touches local in-memory state and never calls Canvas, so it
        runs immediately with no confirm step.
        """
        app.courses.clear("clear_cache")
        return md.done("clear_cache", "Course cache cleared.")
