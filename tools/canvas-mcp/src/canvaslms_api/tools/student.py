from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import READ, WRITE, App
from ..client import CanvasError


def _submission_status(submission: Any) -> str:
    if not submission:
        return "not submitted"
    if submission.get("missing"):
        return "missing"
    if submission.get("late"):
        return "late"
    if submission.get("workflow_state") == "graded" or submission.get("score") is not None:
        return "graded"
    if submission.get("submitted_at"):
        return "submitted"
    return "not submitted"


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def get_upcoming_assignments(days: int = 7) -> str:
        """List everything due across all your courses in the next N days.

        Pulls from Canvas's own planner feed (the same source the dashboard
        uses), so it covers assignments, quizzes, discussions, and calendar
        events together.

        Args:
            days: Number of days ahead to look, starting today.
        """
        now = datetime.now(UTC)
        params = {
            "start_date": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "end_date": (now + timedelta(days=days)).isoformat(timespec="seconds").replace("+00:00", "Z"),
        }
        items = await app.client.get_all("/planner/items", params)
        rows = []
        for item in items:
            plannable = item.get("plannable") or {}
            submission = item.get("submissions")
            status = _submission_status(submission if isinstance(submission, dict) else None)
            rows.append(
                (
                    md.fmt_date(item.get("plannable_date")),
                    item.get("context_name"),
                    item.get("plannable_type"),
                    plannable.get("title") or plannable.get("name"),
                    plannable.get("points_possible"),
                    status,
                )
            )
        rows.sort(key=lambda row: row[0])
        table = md.table(["due", "course", "type", "title", "points", "status"], rows)
        if items.capped:
            table += f"\n\n{md.capped_notice(len(items))}"
        return table

    @mcp.tool(annotations=READ)
    async def get_todo() -> str:
        """List your Canvas to-do items, including ungraded quizzes."""
        items = await app.client.get_all("/users/self/todo", {"include[]": ["ungraded_quizzes"]})
        rows = []
        for item in items:
            assignment = item.get("assignment") or item.get("quiz") or {}
            rows.append(
                (
                    item.get("type"),
                    (item.get("context_name") or item.get("course_id")),
                    assignment.get("title") or assignment.get("name") or item.get("title"),
                    md.fmt_date(assignment.get("due_at") or item.get("due_at")),
                    assignment.get("points_possible"),
                    item.get("html_url"),
                )
            )
        table = md.table(["type", "course", "title", "due", "points", "url"], rows)
        if items.capped:
            table += f"\n\n{md.capped_notice(len(items))}"
        return table

    @mcp.tool(annotations=READ)
    async def get_submission_status(course: str | int | None = None) -> str:
        """Show submission status per assignment across your active courses.

        Lists missing work first, then every assignment's status (submitted,
        missing, late, graded, or not submitted) with its score.

        Args:
            course: Restrict to one course (id, code, name fragment, or
                "sis_course_id:XXX"). Omit to cover every active course.
        """
        blocks = []

        missing_params = {"include[]": ["course"], "filter[]": ["submittable"]}
        missing = await app.client.get_all("/users/self/missing_submissions", missing_params)
        missing_capped = missing.capped
        missing_total = len(missing)
        if course is not None:
            cid = await app.course_id(course)
            missing = [m for m in missing if m.get("course_id") == cid]
        missing_rows = [
            (
                (m.get("course") or {}).get("name") or m.get("course_id"),
                m.get("name"),
                md.fmt_date(m.get("due_at")),
            )
            for m in missing
        ]
        missing_table = md.table(["course", "assignment", "due"], missing_rows)
        if missing_capped:
            missing_table += f"\n\n{md.capped_notice(missing_total)}"
        blocks.append(md.section("Missing work", missing_table))

        if course is not None:
            courses = [{"id": await app.course_id(course)}]
        else:
            courses = await app.courses.active()

        async def fetch(cid: int) -> list[dict[str, Any]]:
            return await app.client.get_all(
                f"/courses/{cid}/assignments",
                {"include[]": ["submission"], "order_by": "due_at"},
            )

        results = await app.client.gather(fetch(c["id"]) for c in courses)
        rows = []
        any_capped = False
        for c, assignments in zip(courses, results, strict=True):
            any_capped = any_capped or assignments.capped
            course_name = await app.course_name(c["id"])
            for assignment in assignments:
                submission = assignment.get("submission")
                rows.append(
                    (
                        course_name,
                        assignment.get("name"),
                        md.fmt_date(assignment.get("due_at")),
                        _submission_status(submission),
                        md.points(
                            submission.get("score") if submission else None,
                            assignment.get("points_possible"),
                        ),
                    )
                )
        all_table = md.table(["course", "assignment", "due", "status", "score"], rows)
        if any_capped:
            all_table += f"\n\n{md.capped_notice(len(rows))}"
        blocks.append(md.section("All assignments", all_table))
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def get_grades(course: str | int | None = None) -> str:
        """Show your current grades.

        Without a course: one row per active course with current score/grade.
        With a course: every graded assignment plus the course totals.

        Args:
            course: Restrict to one course (id, code, name fragment, or
                "sis_course_id:XXX"). Omit to summarize every active course.
        """
        if course is None:
            courses = await app.courses.active()
            rows = []
            for c in courses:
                enrollment = next(iter(c.get("enrollments") or []), {})
                rows.append(
                    (
                        c.get("name"),
                        enrollment.get("computed_current_score"),
                        enrollment.get("computed_current_grade"),
                        enrollment.get("computed_final_score"),
                    )
                )
            table = md.table(["course", "current score", "current grade", "final score"], rows)
            if courses.capped:
                table += f"\n\n{md.capped_notice(len(courses))}"
            return table

        cid = await app.course_id(course)
        details = await app.client.get(f"/courses/{cid}", {"include[]": ["total_scores"]})
        enrollment = next(iter(details.get("enrollments") or []), {})
        assignments = await app.client.get_all(
            f"/courses/{cid}/assignments", {"include[]": ["submission"], "order_by": "due_at"}
        )
        rows = []
        for assignment in assignments:
            submission = assignment.get("submission") or {}
            if submission.get("score") is None and submission.get("workflow_state") != "graded":
                continue
            rows.append(
                (
                    assignment.get("name"),
                    md.fmt_date(assignment.get("due_at")),
                    md.points(submission.get("score"), assignment.get("points_possible")),
                    submission.get("grade"),
                )
            )
        totals = md.kv(
            [
                ("current score", enrollment.get("computed_current_score")),
                ("current grade", enrollment.get("computed_current_grade")),
                ("final score", enrollment.get("computed_final_score")),
            ]
        )
        graded_table = md.table(["assignment", "due", "score", "grade"], rows)
        if assignments.capped:
            graded_table += f"\n\n{md.capped_notice(len(assignments))}"
        return md.join(
            md.heading(details.get("name") or str(cid)),
            totals,
            md.section("Graded assignments", graded_table),
        )

    @mcp.tool(annotations=READ)
    async def get_pending_peer_reviews(
        course: str | int | None = None, assignment_id: str | int | None = None
    ) -> str:
        """List peer reviews assigned to you that you have not completed yet.

        Args:
            course: Restrict to one course (id, code, name fragment, or
                "sis_course_id:XXX"). Omit to scan every active course.
            assignment_id: Restrict to one assignment within the course.
                Requires course to be given.
        """
        if assignment_id is not None and course is None:
            raise ToolError("assignment_id requires course to be given as well.")

        me = await app.client.get("/users/self/profile")
        my_id = me.get("id")

        if course is not None:
            courses = [await app.course_id(course)]
        else:
            courses = [c["id"] for c in await app.courses.active()]

        rows = []
        capped = False
        for cid in courses:
            course_name = await app.course_name(cid)
            if assignment_id is not None:
                assignments = [await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")]
            else:
                assignments = await app.client.get_all(
                    f"/courses/{cid}/assignments", {"include[]": ["submission"]}
                )
                capped = capped or assignments.capped
            for assignment in assignments:
                if not assignment.get("peer_reviews"):
                    continue
                try:
                    reviews = await app.client.get_all(
                        f"/courses/{cid}/assignments/{assignment['id']}/peer_reviews",
                        {"include[]": ["user", "submission_comments"]},
                    )
                    capped = capped or reviews.capped
                except CanvasError:
                    continue
                for review in reviews:
                    if review.get("assessor_id") != my_id:
                        continue
                    if review.get("workflow_state") == "completed":
                        continue
                    rows.append(
                        (
                            course_name,
                            assignment.get("name"),
                            app.person(review.get("user")),
                            review.get("workflow_state"),
                        )
                    )

        notice = md.capped_notice(len(rows)) if capped else ""
        if not rows:
            return md.join("No pending peer reviews.", notice)
        return md.join(md.table(["course", "assignment", "reviewee", "status"], rows), notice)

    @mcp.tool(annotations=READ)
    async def get_submission(course: str | int, assignment_id: str | int) -> str:
        """Show your submission for one assignment: status, score, attempts, comments, rubric.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
        """
        cid = await app.course_id(course)
        submission = await app.client.get(
            f"/courses/{cid}/assignments/{assignment_id}/submissions/self",
            {"include[]": ["submission_comments", "rubric_assessment", "assignment"]},
        )
        assignment = submission.get("assignment") or {}
        body = md.kv(
            [
                ("status", _submission_status(submission)),
                ("submitted at", md.fmt_date(submission.get("submitted_at"))),
                ("attempt", submission.get("attempt")),
                ("attempts allowed", assignment.get("allowed_attempts")),
                ("score", md.points(submission.get("score"), assignment.get("points_possible"))),
                ("grade", submission.get("grade")),
                ("late", submission.get("late")),
                ("missing", submission.get("missing")),
                ("submission type", submission.get("submission_type")),
                ("preview url", submission.get("preview_url")),
            ]
        )
        comments = submission.get("submission_comments") or []
        comment_rows = [
            (app.person(c.get("author")), md.fmt_date(c.get("created_at")), c.get("comment"))
            for c in comments
        ]
        # The comment column is written by graders and peers. Fenced around the
        # whole table rather than per cell: md.cell flattens newlines to keep a
        # table parsable, which a per-cell fence would fight.
        comment_table = md.table(["author", "date", "comment"], comment_rows)
        blocks = [
            body,
            md.section(
                "Comments",
                md.untrusted(comment_table, "submission comments") if comments else comment_table,
            ),
        ]

        rubric = submission.get("rubric_assessment")
        if rubric:
            rubric_rows = [
                (criterion_id, r.get("points"), r.get("comments"))
                for criterion_id, r in rubric.items()
            ]
            blocks.append(md.section("Rubric assessment", md.table(["criterion", "points", "comments"], rubric_rows)))

        return md.join(*blocks)

    @mcp.tool(annotations=WRITE)
    async def submit_assignment(
        course: str | int,
        assignment_id: str | int,
        submission_type: str,
        body: str | None = None,
        url: str | None = None,
        file_paths: list[str] | None = None,
        comment: str | None = None,
        confirm: bool = False,
    ) -> str:
        """Submit your own assignment. Consumes a submission attempt.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            submission_type: One of online_text_entry, online_url, online_upload.
            body: Text content, required for online_text_entry.
            url: URL to submit, required for online_url.
            file_paths: Local file paths to upload, required for online_upload.
            comment: Optional comment to attach to the submission.
            confirm: Must be true to actually submit; otherwise returns a preview.
        """
        allowed_types = {"online_text_entry", "online_url", "online_upload"}
        if submission_type not in allowed_types:
            raise ToolError(f"submission_type must be one of {sorted(allowed_types)}.")
        if submission_type == "online_text_entry" and not body:
            raise ToolError("body is required for online_text_entry.")
        if submission_type == "online_url" and not url:
            raise ToolError("url is required for online_url.")
        if submission_type == "online_upload" and not file_paths:
            raise ToolError("file_paths is required for online_upload.")

        cid = await app.course_id(course)
        assignment = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")
        if submission_type not in (assignment.get("submission_types") or []):
            raise ToolError(
                f"Assignment {assignment.get('name')!r} does not accept {submission_type}. "
                f"Allowed: {assignment.get('submission_types')}."
            )
        if assignment.get("locked_for_user"):
            raise ToolError(f"Assignment {assignment.get('name')!r} is locked for you.")

        existing = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}/submissions/self")
        attempts_used = existing.get("attempt") or 0
        allowed_attempts = assignment.get("allowed_attempts")
        if allowed_attempts and allowed_attempts > 0 and attempts_used >= allowed_attempts:
            raise ToolError(f"No attempts remaining ({attempts_used}/{allowed_attempts} used).")

        details = md.kv(
            [
                ("assignment", assignment.get("name")),
                ("submission type", submission_type),
                ("attempts used", attempts_used),
                ("attempts allowed", allowed_attempts or "unlimited"),
                ("content", url or (file_paths and ", ".join(file_paths)) or md.truncate(body or "", 300)),
            ]
        )

        if not confirm:
            return md.preview("submit_assignment", details)

        payload: dict[str, Any] = {"submission": {"submission_type": submission_type}}
        if submission_type == "online_text_entry":
            payload["submission"]["body"] = body
        elif submission_type == "online_url":
            payload["submission"]["url"] = url
        else:
            file_ids = []
            for path in file_paths or []:
                upload = await app.client.post(
                    f"/courses/{cid}/assignments/{assignment_id}/submissions/self/files",
                    json={"name": path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]},
                )
                upload_url = upload["upload_url"]
                upload_params = upload["upload_params"]
                with open(path, "rb") as fh:
                    async with httpx.AsyncClient() as anonymous:
                        response = await anonymous.post(
                            upload_url, data=upload_params, files={"file": fh}
                        )
                if response.status_code >= 300:
                    location = response.headers.get("location")
                    if location:
                        async with httpx.AsyncClient() as anonymous:
                            response = await anonymous.get(location)
                    else:
                        raise ToolError(f"File upload failed for {path}: {response.status_code}")
                uploaded = response.json()
                file_ids.append(uploaded["id"])
            payload["submission"]["file_ids"] = file_ids

        if comment:
            payload["comment"] = {"text_comment": comment}

        result = await app.client.post(
            f"/courses/{cid}/assignments/{assignment_id}/submissions", json=payload
        )
        return md.done(
            "submit_assignment",
            md.kv(
                [
                    ("status", _submission_status(result)),
                    ("submitted at", md.fmt_date(result.get("submitted_at"))),
                    ("attempt", result.get("attempt")),
                ]
            ),
        )

    @mcp.tool(annotations=WRITE)
    async def comment_on_submission(
        course: str | int, assignment_id: str | int, comment: str, confirm: bool = False
    ) -> str:
        """Add a comment to your own submission.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            comment: The comment text.
            confirm: Must be true to post the comment; otherwise returns a preview.
        """
        if not comment.strip():
            raise ToolError("comment cannot be empty.")
        cid = await app.course_id(course)
        details = md.kv([("course", await app.course_name(cid)), ("comment", comment)])
        if not confirm:
            return md.preview("comment_on_submission", details)

        await app.client.put(
            f"/courses/{cid}/assignments/{assignment_id}/submissions/self",
            json={"comment": {"text_comment": comment}},
        )
        return md.done("comment_on_submission", details)

    @mcp.tool(annotations=WRITE)
    async def mark_module_item_done(
        course: str | int, module_id: str | int, item_id: str | int, confirm: bool = False
    ) -> str:
        """Mark a module item as done for yourself.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            module_id: Canvas module id.
            item_id: Canvas module item id.
            confirm: Must be true to mark it done; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        item = await app.client.get(f"/courses/{cid}/modules/{module_id}/items/{item_id}")
        details = md.kv(
            [
                ("item", item.get("title")),
                ("current completion", (item.get("completion_requirement") or {}).get("completed")),
            ]
        )
        if not confirm:
            return md.preview("mark_module_item_done", details)

        await app.client.put(f"/courses/{cid}/modules/{module_id}/items/{item_id}/done")
        return md.done("mark_module_item_done", details)
