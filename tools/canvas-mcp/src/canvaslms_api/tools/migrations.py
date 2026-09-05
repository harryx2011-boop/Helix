from __future__ import annotations

from typing import Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import DESTRUCTIVE, READ, App
from ..client import CanvasError

DATE_FIELDS = ("old_start_date", "old_end_date", "new_start_date", "new_end_date")


async def _occupancy(app: App, cid: int) -> tuple[dict[str, int], bool]:
    counts = await app.client.gather(
        [
            app.client.get_all(f"/courses/{cid}/modules"),
            app.client.get_all(f"/courses/{cid}/assignments"),
            app.client.get_all(f"/courses/{cid}/pages"),
            app.client.get_all(f"/courses/{cid}/discussion_topics"),
            app.client.get_all(f"/courses/{cid}/files"),
        ]
    )
    occupancy = {
        "modules": len(counts[0]),
        "assignments": len(counts[1]),
        "pages": len(counts[2]),
        "discussions": len(counts[3]),
        "files": len(counts[4]),
    }
    return occupancy, any(c.capped for c in counts)


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=DESTRUCTIVE)
    async def create_content_migration(
        target_course: str | int,
        source_course: str | int,
        old_start_date: str | None = None,
        old_end_date: str | None = None,
        new_start_date: str | None = None,
        new_end_date: str | None = None,
        confirm: bool = False,
    ) -> str:
        """Copy all content from one course into another via a Canvas content migration.

        Args:
            target_course: Course id, code, name fragment, or "sis_course_id:XXX" to copy content into.
            source_course: Course id, code, name fragment, or "sis_course_id:XXX" to copy content from.
            old_start_date: Original course start date; provide all four date fields or none.
            old_end_date: Original course end date; provide all four date fields or none.
            new_start_date: New course start date; provide all four date fields or none.
            new_end_date: New course end date; provide all four date fields or none.
            confirm: Must be true to start the migration; otherwise returns a preview.
        """
        dates = [old_start_date, old_end_date, new_start_date, new_end_date]
        if any(dates) and not all(dates):
            raise ToolError(f"Provide all four of {DATE_FIELDS} or none of them.")

        target_id = await app.course_id(target_course)
        source_id = await app.course_id(source_course)
        if target_id == source_id:
            raise ToolError("target_course and source_course resolve to the same course.")

        target_name, source_name, (occupancy, occupancy_capped) = await app.client.gather(
            [app.course_name(target_id), app.course_name(source_id), _occupancy(app, target_id)]
        )

        details_pairs: list[tuple[str, Any]] = [
            ("source", f"{source_name} (id {source_id})"),
            ("target", f"{target_name} (id {target_id})"),
            (
                "target already has",
                ", ".join(f"{k}: {v}" for k, v in occupancy.items())
                + (" (one or more counts capped at 1000; actual totals may be higher)" if occupancy_capped else ""),
            ),
        ]
        if any(dates):
            details_pairs.append(
                (
                    "date shift",
                    f"{old_start_date}..{old_end_date} -> {new_start_date}..{new_end_date}",
                )
            )
        else:
            details_pairs.append(("date shift", "none"))
        details = md.kv(details_pairs)

        if not confirm:
            return md.preview("create_content_migration", details)

        settings: dict[str, Any] = {"source_course_id": source_id}
        payload: dict[str, Any] = {
            "migration_type": "course_copy_importer",
            "settings": settings,
        }
        if any(dates):
            payload["date_shift_options"] = {
                "shift_dates": True,
                "old_start_date": old_start_date,
                "old_end_date": old_end_date,
                "new_start_date": new_start_date,
                "new_end_date": new_end_date,
            }

        # Canvas can take minutes to validate and queue a course copy before responding.
        created = await app.client.post(
            f"/courses/{target_id}/content_migrations", json=payload, timeout=120.0
        )
        app.courses.clear("create_content_migration")
        return md.done(
            "create_content_migration",
            md.kv(
                [
                    ("migration id", created.get("id")),
                    ("state", created.get("workflow_state")),
                    ("next step", "call get_content_migration_status to poll progress"),
                ]
            ),
        )

    @mcp.tool(annotations=READ)
    async def get_content_migration_status(course: str | int, migration_id: str | int) -> str:
        """Check the status of a content migration and list any migration issues.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX"
                that the migration was run against.
            migration_id: Canvas content migration id.
        """
        cid = await app.course_id(course)
        migration = await app.client.get(f"/courses/{cid}/content_migrations/{migration_id}")
        state = migration.get("workflow_state")

        progress_pct: Any = md.NONE
        progress_url = migration.get("progress_url")
        if progress_url:
            try:
                progress = await app.client.get(progress_url)
                progress_pct = md.percent(progress.get("completion"))
            except CanvasError:
                progress_pct = md.NONE

        summary = md.kv(
            [
                ("state", state),
                ("progress", progress_pct),
                ("started at", md.fmt_date(migration.get("started_at"))),
                ("finished at", md.fmt_date(migration.get("finished_at"))),
            ]
        )

        if state not in ("completed", "failed"):
            return summary

        issues = await app.client.get_all(
            f"/courses/{cid}/content_migrations/{migration_id}/migration_issues"
        )
        rows = [
            (issue.get("issue_type"), issue.get("description"), issue.get("fix_issue_html_url") or md.NONE)
            for issue in issues
        ]
        table = md.table(["type", "description", "fix url"], rows)
        if issues.capped:
            table += f"\n\n{md.capped_notice(len(issues))}"
        return md.join(summary, md.section("Migration issues", table))
