from __future__ import annotations

import statistics
from typing import Any, Literal, get_args

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import DESTRUCTIVE, READ, WRITE, App

# Closed vocabularies are declared as Literal so FastMCP emits a real JSON
# Schema `enum` and a client can reject a bad value before the call is made.
# Prose in an `Args:` block cannot: the model learns the allowed set by eating a
# ToolError and retrying, which costs a round trip the first time every time.
#
# The runtime checks below are kept — a schema constrains a well-behaved client,
# and a server does not get to assume one.
Bucket = Literal["past", "overdue", "undated", "ungraded", "unsubmitted", "upcoming", "future"]
GradingType = Literal["points", "percent", "letter_grade", "gpa_scale", "pass_fail", "not_graded"]
StatusFilter = Literal["submitted", "unsubmitted", "graded", "late", "missing"]

BUCKETS = set(get_args(Bucket))
# Deliberately NOT a Literal: the parameter takes a comma-joined LIST of these,
# so the string a caller sends is never itself one of the values.
SUBMISSION_TYPES = {
    "online_text_entry",
    "online_url",
    "online_upload",
    "online_quiz",
    "media_recording",
    "discussion_topic",
    "external_tool",
    "on_paper",
    "not_graded",
    "wiki_page",
    "student_annotation",
    "none",
}
GRADING_TYPES = set(get_args(GradingType))
STATUS_FILTERS = set(get_args(StatusFilter))


def _submission_status(submission: dict[str, Any] | None) -> str:
    if not submission:
        return "not submitted"
    if submission.get("missing"):
        return "missing"
    if submission.get("late"):
        return "late"
    if submission.get("workflow_state") == "graded":
        return "graded"
    if submission.get("workflow_state") == "submitted":
        return "submitted"
    return submission.get("workflow_state") or "not submitted"


def _validate_submission_types(raw: str) -> list[str]:
    types = [t.strip() for t in raw.split(",") if t.strip()]
    if not types:
        raise ToolError("submission_types must not be empty.")
    bad = [t for t in types if t not in SUBMISSION_TYPES]
    if bad:
        raise ToolError(
            f"Invalid submission_types {bad}. Allowed: {', '.join(sorted(SUBMISSION_TYPES))}."
        )
    return types


def _assignment_payload(
    *,
    name: str | None = None,
    description: str | None = None,
    submission_types: str | None = None,
    due_at: str | None = None,
    points_possible: float | None = None,
    grading_type: GradingType | None = None,
    published: bool | None = None,
    peer_reviews: bool | None = None,
    automatic_peer_reviews: bool | None = None,
    unlock_at: str | None = None,
    lock_at: str | None = None,
    assignment_group_id: str | int | None = None,
    allowed_extensions: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if name is not None:
        payload["name"] = name
    if description is not None:
        payload["description"] = description
    if submission_types is not None:
        payload["submission_types"] = _validate_submission_types(submission_types)
    if due_at is not None:
        payload["due_at"] = due_at
    if points_possible is not None:
        payload["points_possible"] = points_possible
    if grading_type is not None:
        if grading_type not in GRADING_TYPES:
            raise ToolError(
                f"Invalid grading_type {grading_type!r}. Allowed: {', '.join(sorted(GRADING_TYPES))}."
            )
        payload["grading_type"] = grading_type
    if published is not None:
        payload["published"] = published
    if peer_reviews is not None:
        payload["peer_reviews"] = peer_reviews
    if automatic_peer_reviews is not None:
        payload["automatic_peer_reviews"] = automatic_peer_reviews
    if unlock_at is not None:
        payload["unlock_at"] = unlock_at
    if lock_at is not None:
        payload["lock_at"] = lock_at
    if assignment_group_id is not None:
        payload["assignment_group_id"] = assignment_group_id
    if allowed_extensions is not None:
        payload["allowed_extensions"] = [e.strip().lstrip(".") for e in allowed_extensions.split(",") if e.strip()]
    return payload


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_assignments(course: str | int, bucket: Bucket | None = None) -> str:
        """List assignments in a course, with your submission status.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            bucket: Optional Canvas bucket filter: past, overdue, undated, ungraded,
                unsubmitted, upcoming, or future.
        """
        if bucket is not None and bucket not in BUCKETS:
            raise ToolError(f"Invalid bucket {bucket!r}. Allowed: {', '.join(sorted(BUCKETS))}.")
        cid = await app.course_id(course)
        params: dict[str, Any] = {"include[]": ["submission"], "order_by": "due_at"}
        if bucket:
            params["bucket"] = bucket
        assignments = await app.client.get_all(f"/courses/{cid}/assignments", params)
        rows = [
            (
                a.get("id"),
                a.get("name"),
                md.fmt_date(a.get("due_at")),
                md.points(None, a.get("points_possible")) if a.get("points_possible") is None
                else a.get("points_possible"),
                ", ".join(a.get("submission_types") or []),
                _submission_status(a.get("submission")),
                a.get("html_url"),
            )
            for a in assignments
        ]
        table = md.table(
            ["id", "name", "due", "points", "submission types", "status", "url"], rows
        )
        if assignments.capped:
            table += f"\n\n{md.capped_notice(len(assignments))}"
        return table

    @mcp.tool(annotations=READ)
    async def get_assignment(course: str | int, assignment_id: str | int) -> str:
        """Get full details for one assignment, including description and rubric summary.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
        """
        cid = await app.course_id(course)
        assignment = await app.client.get(
            f"/courses/{cid}/assignments/{assignment_id}", {"include[]": ["submission"]}
        )
        rubric = assignment.get("rubric") or []
        rubric_summary = (
            f"{len(rubric)} criteria, {assignment.get('points_possible')} points possible"
            if rubric
            else "none"
        )
        details = md.kv(
            [
                ("id", assignment.get("id")),
                ("name", assignment.get("name")),
                ("due", md.fmt_date(assignment.get("due_at"))),
                ("unlock", md.fmt_date(assignment.get("unlock_at"))),
                ("lock", md.fmt_date(assignment.get("lock_at"))),
                ("points possible", assignment.get("points_possible")),
                ("grading type", assignment.get("grading_type")),
                ("submission types", ", ".join(assignment.get("submission_types") or [])),
                ("allowed attempts", assignment.get("allowed_attempts")),
                ("published", assignment.get("published")),
                ("peer reviews", assignment.get("peer_reviews")),
                ("rubric", rubric_summary),
                ("group category", assignment.get("group_category_id")),
                ("url", assignment.get("html_url")),
            ]
        )
        description = md.html_to_text(assignment.get("description"), 4000)
        blocks = [details, md.section("Description", description or "_none_")]
        submission = assignment.get("submission")
        if submission:
            blocks.append(
                md.section(
                    "Your submission",
                    md.kv(
                        [
                            ("status", _submission_status(submission)),
                            ("submitted at", md.fmt_date(submission.get("submitted_at"))),
                            ("score", md.points(submission.get("score"), assignment.get("points_possible"))),
                            ("grade", submission.get("grade")),
                        ]
                    ),
                )
            )
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def list_submissions(
        course: str | int, assignment_id: str | int, status: StatusFilter | None = None
    ) -> str:
        """List student submissions for an assignment.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            status: Optional filter: submitted, unsubmitted, graded, late, or missing.
        """
        if status is not None and status not in STATUS_FILTERS:
            raise ToolError(f"Invalid status {status!r}. Allowed: {', '.join(sorted(STATUS_FILTERS))}.")
        cid = await app.course_id(course)
        submissions = await app.client.get_all(
            f"/courses/{cid}/assignments/{assignment_id}/submissions",
            {"include[]": ["user", "submission_comments"]},
        )
        capped = submissions.capped
        total_fetched = len(submissions)
        if status:
            if status == "submitted":
                submissions = [s for s in submissions if s.get("workflow_state") != "unsubmitted"]
            elif status == "unsubmitted":
                submissions = [s for s in submissions if s.get("workflow_state") == "unsubmitted"]
            elif status == "graded":
                submissions = [s for s in submissions if s.get("workflow_state") == "graded"]
            elif status == "late":
                submissions = [s for s in submissions if s.get("late")]
            elif status == "missing":
                submissions = [s for s in submissions if s.get("missing")]
        rows = [
            (
                app.person(s.get("user")),
                _submission_status(s),
                md.fmt_date(s.get("submitted_at")),
                s.get("score"),
                s.get("grade"),
                s.get("late"),
                s.get("missing"),
            )
            for s in submissions
        ]
        table = md.table(
            ["student", "status", "submitted at", "score", "grade", "late", "missing"], rows
        )
        if capped:
            table += f"\n\n{md.capped_notice(total_fetched)}"
        return table

    @mcp.tool(annotations=READ)
    async def get_assignment_analytics(course: str | int, assignment_id: str | int) -> str:
        """Get performance analytics for an assignment: completion, grade distribution, late/missing counts.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
        """
        cid = await app.course_id(course)
        assignment = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")
        possible = assignment.get("points_possible") or 0
        submissions = await app.client.get_all(
            f"/courses/{cid}/assignments/{assignment_id}/submissions"
        )
        total = len(submissions)
        submitted = [s for s in submissions if s.get("workflow_state") != "unsubmitted"]
        graded = [s for s in submissions if s.get("score") is not None]
        scores = [s["score"] for s in graded]
        buckets = {"0-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0}
        if possible:
            for score in scores:
                pct = (score / possible) * 100
                if pct < 60:
                    buckets["0-59"] += 1
                elif pct < 70:
                    buckets["60-69"] += 1
                elif pct < 80:
                    buckets["70-79"] += 1
                elif pct < 90:
                    buckets["80-89"] += 1
                else:
                    buckets["90-100"] += 1
        late = sum(1 for s in submissions if s.get("late"))
        missing = sum(1 for s in submissions if s.get("missing"))
        summary = md.kv(
            [
                ("total students", total),
                ("submitted", f"{len(submitted)} ({md.percent(len(submitted) / total * 100 if total else 0)})"),
                ("graded", f"{len(graded)} ({md.percent(len(graded) / total * 100 if total else 0)})"),
                ("mean score", round(statistics.mean(scores), 2) if scores else md.NONE),
                ("median score", round(statistics.median(scores), 2) if scores else md.NONE),
                ("min score", min(scores) if scores else md.NONE),
                ("max score", max(scores) if scores else md.NONE),
                ("late", late),
                ("missing", missing),
            ]
        )
        dist_rows = [
            (label, count, md.percent(count / len(scores) * 100 if scores else 0))
            for label, count in buckets.items()
        ]
        distribution = md.table(["range", "count", "% of graded"], dist_rows) if possible else "_assignment has no points possible_"
        notice = md.capped_notice(total) if submissions.capped else ""
        return md.join(summary, md.section("Grade distribution", distribution), notice)

    @mcp.tool(annotations=READ)
    async def get_student_analytics(course: str | int, student_id: str | int | None = None) -> str:
        """Get performance analytics for one student, or a course-wide summary if no student is given.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            student_id: Canvas user id of the student. Omit for a course-wide summary.
        """
        cid = await app.course_id(course)
        assignments = await app.client.get_all(
            f"/courses/{cid}/assignments", {"include[]": ["submission"], "order_by": "due_at"}
        )

        if student_id is not None:
            enrollments = await app.client.get_all(
                f"/courses/{cid}/enrollments",
                {"user_id": student_id, "include[]": ["user"]},
            )
            enrollment = next(iter(enrollments), {})
            grades = enrollment.get("grades") or {}
            missing = late = submitted_count = 0
            graded_scores = []
            for a in assignments:
                submission_list = await app.client.get(
                    f"/courses/{cid}/assignments/{a['id']}/submissions/{student_id}"
                )
                if submission_list.get("missing"):
                    missing += 1
                if submission_list.get("late"):
                    late += 1
                if submission_list.get("workflow_state") != "unsubmitted":
                    submitted_count += 1
                if submission_list.get("score") is not None and a.get("points_possible"):
                    graded_scores.append((a.get("name"), submission_list["score"], a["points_possible"]))
            trend = graded_scores[-5:]
            trend_text = (
                ", ".join(f"{n}: {md.percent(s / p * 100)}" for n, s, p in trend)
                if trend
                else "_no graded assignments_"
            )
            avg_pct = (
                statistics.mean(s / p * 100 for _, s, p in graded_scores) if graded_scores else None
            )
            name = app.person(enrollment.get("user"))
            return md.join(
                md.heading(name, 2),
                md.kv(
                    [
                        ("submitted", submitted_count),
                        ("missing", missing),
                        ("late", late),
                        ("average score", md.percent(avg_pct) if avg_pct is not None else md.NONE),
                        ("current grade", grades.get("current_grade")),
                        ("current score", grades.get("current_score")),
                    ]
                ),
                md.section("Trend (last 5 graded)", trend_text, level=3),
                md.capped_notice(len(assignments)) if assignments.capped else "",
            )

        total = len(assignments)
        submitted = sum(1 for a in assignments if a.get("submission") and a["submission"].get("workflow_state") != "unsubmitted")
        missing = sum(1 for a in assignments if a.get("submission") and a["submission"].get("missing"))
        return md.join(
            md.heading(await app.course_name(cid), 2),
            md.kv(
                [
                    ("total assignments", total),
                    ("your submitted", submitted),
                    ("your missing", missing),
                ]
            ),
            "_Pass student_id for per-student analytics._",
            md.capped_notice(total) if assignments.capped else "",
        )

    @mcp.tool(annotations=WRITE)
    async def create_assignment(
        course: str | int,
        name: str,
        description: str | None = None,
        submission_types: str = "online_text_entry",
        due_at: str | None = None,
        points_possible: float | None = None,
        grading_type: GradingType | None = None,
        published: bool = False,
        peer_reviews: bool = False,
        automatic_peer_reviews: bool = False,
        unlock_at: str | None = None,
        lock_at: str | None = None,
        assignment_group_id: str | int | None = None,
        allowed_extensions: str | None = None,
        confirm: bool = False,
    ) -> str:
        """Create a new assignment in a course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            name: Assignment name/title.
            description: HTML content for the assignment body.
            submission_types: Comma-separated list, e.g. "online_text_entry,online_upload".
            due_at: Due date in ISO 8601 format.
            points_possible: Maximum points for the assignment.
            grading_type: One of: points, percent, letter_grade, gpa_scale, pass_fail, not_graded.
            published: Whether to publish immediately (default: false for safety).
            peer_reviews: Enable peer reviews.
            automatic_peer_reviews: Automatically assign peer reviews when enabled.
            unlock_at: When the assignment becomes available (ISO 8601 format).
            lock_at: When the assignment locks (ISO 8601 format).
            assignment_group_id: Id of the assignment group to place this in.
            allowed_extensions: Comma-separated file extensions for online_upload, e.g. "pdf,docx".
            confirm: Must be true to actually create the assignment.
        """
        cid = await app.course_id(course)
        payload = _assignment_payload(
            name=name,
            description=description,
            submission_types=submission_types,
            due_at=due_at,
            points_possible=points_possible,
            grading_type=grading_type,
            published=published,
            peer_reviews=peer_reviews,
            automatic_peer_reviews=automatic_peer_reviews,
            unlock_at=unlock_at,
            lock_at=lock_at,
            assignment_group_id=assignment_group_id,
            allowed_extensions=allowed_extensions,
        )
        if not confirm:
            return md.preview(
                "create_assignment", md.join(md.kv([("course", await app.course_name(cid))]), md.kv(payload.items()))
            )
        created = await app.client.post(f"/courses/{cid}/assignments", json={"assignment": payload})
        dropped = [k for k in payload if k not in created]
        details = md.kv(
            [
                ("id", created.get("id")),
                ("name", created.get("name")),
                ("due", md.fmt_date(created.get("due_at"))),
                ("points possible", created.get("points_possible")),
                ("published", created.get("published")),
                ("url", created.get("html_url")),
            ]
        )
        if dropped:
            details = md.join(details, f"**Note:** Canvas did not echo these fields: {', '.join(dropped)}.")
        return md.done("create_assignment", details)

    @mcp.tool(annotations=WRITE)
    async def update_assignment(
        course: str | int,
        assignment_id: str | int,
        name: str | None = None,
        description: str | None = None,
        submission_types: str | None = None,
        due_at: str | None = None,
        points_possible: float | None = None,
        grading_type: GradingType | None = None,
        published: bool | None = None,
        peer_reviews: bool | None = None,
        automatic_peer_reviews: bool | None = None,
        unlock_at: str | None = None,
        lock_at: str | None = None,
        assignment_group_id: str | int | None = None,
        allowed_extensions: str | None = None,
        confirm: bool = False,
    ) -> str:
        """Update an existing assignment. Only fields you pass are changed.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id to update.
            name: New assignment name/title.
            description: New HTML description.
            submission_types: Comma-separated list, e.g. "online_text_entry,online_upload".
            due_at: New due date in ISO 8601 format.
            points_possible: New maximum points.
            grading_type: One of: points, percent, letter_grade, gpa_scale, pass_fail, not_graded.
            published: Whether to publish the assignment.
            peer_reviews: Enable peer reviews.
            automatic_peer_reviews: Auto-assign peer reviews.
            unlock_at: New available date in ISO 8601 format.
            lock_at: New lock date in ISO 8601 format.
            assignment_group_id: Assignment group id to move to.
            allowed_extensions: Comma-separated file extensions, e.g. "pdf,docx".
            confirm: Must be true to actually apply the update.
        """
        cid = await app.course_id(course)
        payload = _assignment_payload(
            name=name,
            description=description,
            submission_types=submission_types,
            due_at=due_at,
            points_possible=points_possible,
            grading_type=grading_type,
            published=published,
            peer_reviews=peer_reviews,
            automatic_peer_reviews=automatic_peer_reviews,
            unlock_at=unlock_at,
            lock_at=lock_at,
            assignment_group_id=assignment_group_id,
            allowed_extensions=allowed_extensions,
        )
        if not payload:
            raise ToolError("No fields to update were given.")
        current = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")
        if not confirm:
            changes = []
            for key, new_value in payload.items():
                old_value = current.get(key)
                changes.append((key, old_value, new_value))
            rows = md.table(["field", "before", "after"], changes)
            return md.preview("update_assignment", rows)
        updated = await app.client.put(
            f"/courses/{cid}/assignments/{assignment_id}", json={"assignment": payload}
        )
        dropped = [k for k in payload if payload[k] != updated.get(k)]
        details = md.kv(
            [
                ("id", updated.get("id")),
                ("name", updated.get("name")),
                ("due", md.fmt_date(updated.get("due_at"))),
                ("points possible", updated.get("points_possible")),
                ("published", updated.get("published")),
            ]
        )
        if dropped:
            details = md.join(details, f"**Note:** Canvas did not apply these fields as requested: {', '.join(dropped)}.")
        return md.done("update_assignment", details)

    @mcp.tool(annotations=DESTRUCTIVE)
    async def bulk_grade_submissions(
        course: str | int, assignment_id: str | int, grades: dict[str, Any], confirm: bool = False
    ) -> str:
        """Grade multiple submissions for an assignment concurrently.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            grades: Maps user_id (as string) to either a grade value (e.g. "85" or "A"),
                or a dict {"grade": ..., "comment": "..."}.
            confirm: Must be true to actually submit the grades.
        """
        if not grades:
            raise ToolError("grades must not be empty.")
        cid = await app.course_id(course)
        submissions = await app.client.get_all(
            f"/courses/{cid}/assignments/{assignment_id}/submissions",
            {"include[]": ["user"]},
        )
        by_user = {str(s.get("user_id")): s for s in submissions}
        rows = []
        payloads: dict[str, dict[str, Any]] = {}
        for user_id, spec in grades.items():
            grade_value = spec.get("grade") if isinstance(spec, dict) else spec
            comment = spec.get("comment") if isinstance(spec, dict) else None
            existing = by_user.get(str(user_id))
            student_name = app.person(existing.get("user")) if existing else f"user {user_id}"
            current_score = existing.get("score") if existing else None
            rows.append((student_name, user_id, current_score, grade_value))
            body: dict[str, Any] = {"submission": {"posted_grade": grade_value}}
            if comment:
                body["comment"] = {"text_comment": comment}
            payloads[str(user_id)] = body
        if not confirm:
            details = md.table(["student", "user id", "current score", "new grade"], rows)
            if submissions.capped:
                details = md.join(
                    details,
                    f"{md.capped_notice(len(submissions))} A student outside the first 1000 submissions "
                    "shows no current score above, but their grade will still be submitted correctly.",
                )
            return md.preview("bulk_grade_submissions", details)
        results = await app.client.gather(
            [
                # Graded in one concurrent batch behind the semaphore; a full roster can queue
                # behind the concurrency cap longer than the 30s default.
                app.client.put(
                    f"/courses/{cid}/assignments/{assignment_id}/submissions/{user_id}",
                    json=body,
                    timeout=90.0,
                )
                for user_id, body in payloads.items()
            ]
        )
        successes = []
        failures = []
        for user_id, result in zip(payloads.keys(), results, strict=True):
            if isinstance(result, Exception):
                failures.append((user_id, str(result)))
            else:
                successes.append((user_id, result.get("score"), result.get("grade")))
        details = md.join(
            md.section("Succeeded", md.table(["user id", "score", "grade"], successes) if successes else "_none_"),
            md.section("Failed", md.table(["user id", "error"], failures) if failures else "_none_"),
        )
        return md.done("bulk_grade_submissions", details)

    @mcp.tool(annotations=WRITE)
    async def grade_with_rubric(
        course: str | int,
        assignment_id: str | int,
        user_id: str | int,
        rubric_assessment: dict[str, Any],
        confirm: bool = False,
    ) -> str:
        """Grade a single submission using its assignment's rubric.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            user_id: Canvas user id of the student being graded.
            rubric_assessment: Maps criterion_id to {"points": n, "comments": "..."}, or a bare number.
            confirm: Must be true to actually submit the grade.
        """
        if not rubric_assessment:
            raise ToolError("rubric_assessment must not be empty.")
        cid = await app.course_id(course)
        assignment = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")
        rubric = assignment.get("rubric") or []
        valid_ids = {str(c.get("id")) for c in rubric}
        if rubric:
            bad_ids = [cid_ for cid_ in rubric_assessment if str(cid_) not in valid_ids]
            if bad_ids:
                raise ToolError(
                    f"Unknown rubric criterion ids {bad_ids}. Valid ids: {sorted(valid_ids)}."
                )
        form: dict[str, Any] = {}
        total = 0.0
        rows = []
        for criterion_id, spec in rubric_assessment.items():
            points = spec.get("points") if isinstance(spec, dict) else spec
            comments = spec.get("comments") if isinstance(spec, dict) else None
            form[f"rubric_assessment[{criterion_id}][points]"] = points
            if comments:
                form[f"rubric_assessment[{criterion_id}][comments]"] = comments
            total += float(points or 0)
            rows.append((criterion_id, points, comments or ""))
        if not confirm:
            return md.preview(
                "grade_with_rubric",
                md.join(md.table(["criterion id", "points", "comments"], rows), f"**Total:** {total}"),
            )
        updated = await app.client.put(
            f"/courses/{cid}/assignments/{assignment_id}/submissions/{user_id}", data=form
        )
        details = md.kv(
            [
                ("student", app.person(updated.get("user"), fallback=f"user {user_id}")),
                ("score", updated.get("score")),
                ("grade", updated.get("grade")),
            ]
        )
        return md.done("grade_with_rubric", details)
