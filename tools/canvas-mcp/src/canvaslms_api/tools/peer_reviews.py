from __future__ import annotations

import csv
import io
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, get_args

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import DESTRUCTIVE, READ, WRITE, App
from ..client import CanvasError

# Closed vocabularies are Literal so FastMCP emits a JSON Schema `enum`
# and a client can reject a bad value before the call. Prose in an `Args:`
# block cannot; the model would learn the set by eating a ToolError.
# Runtime checks are kept — a schema binds a well-behaved client only.
Priority = Literal["high", "medium", "low"]

PRIORITIES = set(get_args(Priority))

GENERIC_PHRASES = [
    "good job", "nice work", "well done", "great job", "looks good",
    "good work", "nice job", "keep it up", "good", "nice",
]
SUGGESTION_MARKERS = [
    "suggest", "consider", "could improve", "should", "recommend",
    "might want", "try to", "instead", "would be better", "needs to",
]
SPECIFIC_MARKERS = [
    "paragraph", "sentence", "section", "example", "citation", "argument",
    "conclusion", "introduction", "evidence", "structure", "line",
]


@dataclass
class _PeerReviewData:
    assignment: dict[str, Any]
    reviews: list[dict[str, Any]]
    submissions_by_id: dict[int, dict[str, Any]]
    reviewees_by_user: dict[int, dict[str, Any]]
    capped: bool = False

    def notice(self) -> str:
        return md.capped_notice(len(self.reviews)) if self.capped else ""


async def _load(app: App, cid: int, assignment_id: str | int) -> _PeerReviewData:
    assignment = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")
    reviews = await app.client.get_all(
        f"/courses/{cid}/assignments/{assignment_id}/peer_reviews",
        {"include[]": ["user", "submission_comments"]},
    )
    submissions = await app.client.get_all(
        f"/courses/{cid}/assignments/{assignment_id}/submissions",
        {"include[]": ["user"]},
    )
    submissions_by_id = {s["id"]: s for s in submissions if s.get("id") is not None}
    reviewees_by_user = {s["user_id"]: s for s in submissions if s.get("user_id") is not None}
    return _PeerReviewData(
        assignment=assignment,
        reviews=reviews,
        submissions_by_id=submissions_by_id,
        reviewees_by_user=reviewees_by_user,
        capped=reviews.capped or submissions.capped,
    )


def _reviewee_user(review: dict[str, Any], data: _PeerReviewData) -> dict[str, Any] | None:
    user = review.get("user")
    if user:
        return user
    submission = data.submissions_by_id.get(review.get("asset_id"))
    return submission.get("user") if submission else None


def _review_comments(review: dict[str, Any]) -> list[dict[str, Any]]:
    assessor_id = review.get("assessor_id")
    return [
        c for c in review.get("submission_comments") or [] if c.get("author_id") == assessor_id
    ]


def _last_comment_date(review: dict[str, Any]) -> str | None:
    dates = [c.get("created_at") for c in _review_comments(review) if c.get("created_at")]
    return max(dates) if dates else None


def _split_sentences(text: str) -> list[str]:
    return [s for s in re.split(r"[.!?]+", text) if s.strip()]


def _quality_score(text: str, min_words: int) -> tuple[int, float, list[str]]:
    words = text.split()
    word_count = len(words)
    flags: list[str] = []
    lowered = text.casefold()

    if word_count == 0:
        return 1, 0.0, ["empty"]
    if word_count < min_words:
        flags.append("too short")

    sentences = _split_sentences(text)
    generic_hits = sum(1 for phrase in GENERIC_PHRASES if phrase in lowered)
    is_mostly_generic = word_count < 15 and generic_hits > 0
    if is_mostly_generic:
        flags.append("generic")

    has_suggestion = any(marker in lowered for marker in SUGGESTION_MARKERS)
    if not has_suggestion:
        flags.append("no suggestions")

    specific_hits = sum(1 for marker in SPECIFIC_MARKERS if marker in lowered)
    specificity = min(1.0, (specific_hits + has_suggestion) / 4)

    score = 1
    if word_count >= min_words:
        score += 1
    if len(sentences) >= 2:
        score += 1
    if has_suggestion:
        score += 1
    if specific_hits >= 2:
        score += 1
    if is_mostly_generic:
        score = min(score, 2)
    score = max(1, min(5, score))
    return score, specificity, flags


def _priority_filter_check(value: str | None) -> None:
    if value is not None and value not in PRIORITIES:
        raise ToolError(f"Invalid priority_filter {value!r}. Allowed: {', '.join(sorted(PRIORITIES))}.")


def _completion_counts(data: _PeerReviewData) -> dict[int, dict[str, int]]:
    by_assessor: dict[int, dict[str, int]] = {}
    for review in data.reviews:
        assessor_id = review.get("assessor_id")
        if assessor_id is None:
            continue
        entry = by_assessor.setdefault(assessor_id, {"assigned": 0, "completed": 0})
        entry["assigned"] += 1
        if review.get("workflow_state") == "completed":
            entry["completed"] += 1
    return by_assessor


def _days_since(date_str: str | None) -> int | None:
    if not date_str:
        return None
    try:
        parsed = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (datetime.now(UTC) - parsed).days


def _resolve_save_path(app: App, filename: str | None, default_stem: str, extension: str) -> Path:
    name = filename or f"{default_stem}.{extension}"
    if os.path.basename(name) != name or ".." in Path(name).parts:
        raise ToolError(f"Refusing to save file with unsafe name {name!r}.")
    target_dir = app.settings.download_dir or Path(tempfile.gettempdir())
    target_dir = target_dir.expanduser().resolve()
    if not target_dir.is_dir():
        raise ToolError(f"Target directory {target_dir} does not exist or is not a directory.")
    dest = target_dir / name
    if dest.resolve().parent != target_dir:
        raise ToolError(f"Refusing to save outside the target directory: {dest}.")
    stem, suffix = dest.stem, dest.suffix
    counter = 1
    while dest.exists():
        dest = target_dir / f"{stem} ({counter}){suffix}"
        counter += 1
    return dest


def _compose_followup_body(tier: str, assignment_name: str, pending_count: int, due_at: str | None) -> str:
    due_text = md.fmt_date(due_at) if due_at else "the posted deadline"
    if tier == "high":
        return (
            f"You have {pending_count} peer review(s) still outstanding for \"{assignment_name}\", "
            f"which was due {due_text}. This is now overdue and needs to be completed as soon as "
            "possible to avoid a grade penalty. Please submit your peer feedback right away."
        )
    return (
        f"This is a reminder that you have {pending_count} peer review(s) pending for "
        f"\"{assignment_name}\" (due {due_text}). Please complete them at your earliest convenience."
    )


async def _send_conversations(
    app: App, cid: int, recipient_ids: list[int], subject: str, bodies: dict[int, str]
) -> list[tuple[int, str]]:
    async def send_one(user_id: int) -> Any:
        return await app.client.post(
            "/conversations",
            json={
                "recipients[]": [str(user_id)],
                "subject": subject,
                "body": bodies[user_id],
                "context_code": f"course_{cid}",
                "bulk_message": True,
            },
        )

    results = await app.client.gather(send_one(uid) for uid in recipient_ids)
    out: list[tuple[int, str]] = []
    for uid, result in zip(recipient_ids, results, strict=True):
        if isinstance(result, Exception):
            message = result.message if isinstance(result, CanvasError) else str(result)
            out.append((uid, f"failed: {message}"))
        else:
            out.append((uid, "sent"))
    return out


async def _require_manage_grades(app: App, cid: int) -> None:
    try:
        permissions = await app.client.get(
            f"/courses/{cid}/permissions", {"permissions[]": ["manage_grades"]}
        )
    except CanvasError as exc:
        raise ToolError(f"Could not verify manage_grades permission: {exc.message}") from exc
    if not permissions.get("manage_grades"):
        raise ToolError("Your Canvas role does not have manage_grades permission in this course.")


def _followup_rows(data: _PeerReviewData, days_threshold: int) -> list[dict[str, Any]]:
    counts = _completion_counts(data)
    due_at = data.assignment.get("due_at")
    days_past_due = _days_since(due_at) if due_at else None
    rows: list[dict[str, Any]] = []
    for user_id, submission in data.reviewees_by_user.items():
        assessor_reviews = [r for r in data.reviews if r.get("assessor_id") == user_id]
        if not assessor_reviews:
            continue
        pending = [r for r in assessor_reviews if r.get("workflow_state") != "completed"]
        if not pending:
            continue
        assigned = counts.get(user_id, {}).get("assigned", len(assessor_reviews))
        completed = counts.get(user_id, {}).get("completed", 0)
        all_pending = completed == 0
        overdue = days_past_due is not None and days_past_due >= days_threshold
        if all_pending and overdue:
            priority = "high"
        elif len(pending) < assigned:
            priority = "medium"
        else:
            priority = "low"
        rows.append(
            {
                "user_id": user_id,
                "user": submission.get("user"),
                "pending": len(pending),
                "assigned": assigned,
                "completed": completed,
                "days_past_due": days_past_due if days_past_due is not None else 0,
                "priority": priority,
            }
        )
    order = {"high": 0, "medium": 1, "low": 2}
    rows.sort(key=lambda r: (order[r["priority"]], -r["pending"]))
    return rows


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_peer_reviews(course: str | int, assignment_id: str | int) -> str:
        """List all peer review assignments for an assignment.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
        """
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        rows = [
            (
                r.get("id"),
                app.person(r.get("assessor")),
                app.person(_reviewee_user(r, data)),
                r.get("workflow_state"),
                len(_review_comments(r)),
                md.fmt_date(_last_comment_date(r)),
            )
            for r in data.reviews
        ]
        table = md.table(
            ["review id", "reviewer", "reviewee", "state", "comments", "last comment"], rows
        )
        return md.join(table, data.notice())

    @mcp.tool(annotations=WRITE)
    async def assign_peer_review(
        course: str | int,
        assignment_id: str | int,
        reviewer_id: str | int,
        reviewee_id: str | int,
        confirm: bool = False,
    ) -> str:
        """Manually assign a peer review: one reviewer to one reviewee's submission.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            reviewer_id: Canvas user id of the student who will review.
            reviewee_id: Canvas user id of the student whose submission is reviewed.
            confirm: Must be true to actually create the assignment.
        """
        if str(reviewer_id) == str(reviewee_id):
            raise ToolError("reviewer_id and reviewee_id must be different students.")
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        reviewee_submission = data.reviewees_by_user.get(int(reviewee_id))
        if reviewee_submission is None or reviewee_submission.get("id") is None:
            raise ToolError(f"Reviewee {reviewee_id} has no submission for this assignment.")

        reviewer_enrollments = await app.client.get_all(
            f"/courses/{cid}/enrollments", {"user_id": reviewer_id, "include[]": ["user"]}
        )
        reviewer_user = (reviewer_enrollments[0].get("user") if reviewer_enrollments else None) or {
            "id": reviewer_id
        }
        submission_id = reviewee_submission["id"]

        details = md.kv(
            [
                ("assignment", data.assignment.get("name")),
                ("reviewer", app.person(reviewer_user, fallback=f"user {reviewer_id}")),
                ("reviewee", app.person(reviewee_submission.get("user"), fallback=f"user {reviewee_id}")),
                ("reviewee submission id", submission_id),
            ]
        )
        if not confirm:
            return md.preview("assign_peer_review", details)

        created = await app.client.post(
            f"/courses/{cid}/assignments/{assignment_id}/submissions/{submission_id}/peer_reviews",
            params={"user_id": reviewer_id},
        )
        return md.done(
            "assign_peer_review",
            md.kv(
                [
                    ("review id", created.get("id")),
                    ("state", created.get("workflow_state")),
                ]
            ),
        )

    @mcp.tool(annotations=READ)
    async def get_peer_review_assignments(
        course: str | int,
        assignment_id: str | int,
        include_names: bool = True,
        include_submission_details: bool = False,
    ) -> str:
        """Show who reviews whom for an assignment, with completion state.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            include_names: Resolve reviewer/reviewee names instead of raw ids.
            include_submission_details: Include the reviewee's submitted-at time and late flag.
        """
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        headers = ["reviewer", "reviewee", "state"]
        if include_submission_details:
            headers += ["submitted at", "late"]
        rows = []
        for r in data.reviews:
            reviewee_user = _reviewee_user(r, data)
            reviewer = app.person(r.get("assessor")) if include_names else r.get("assessor_id")
            reviewee = app.person(reviewee_user) if include_names else r.get("user_id")
            row = [reviewer, reviewee, r.get("workflow_state")]
            if include_submission_details:
                submission = data.submissions_by_id.get(r.get("asset_id")) or {}
                row.append(md.fmt_date(submission.get("submitted_at")))
                row.append(submission.get("late"))
            rows.append(tuple(row))
        completed = sum(1 for r in data.reviews if r.get("workflow_state") == "completed")
        total = len(data.reviews)
        table = md.table(headers, rows)
        totals = f"**Total:** {completed} / {total} completed"
        return md.join(table, totals, data.notice())

    @mcp.tool(annotations=READ)
    async def get_peer_review_completion_analytics(
        course: str | int, assignment_id: str | int, include_student_details: bool = False
    ) -> str:
        """Get completion analytics for peer reviews on an assignment.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            include_student_details: Include a per-student assigned/completed/pending table.
        """
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        total = len(data.reviews)
        completed = sum(1 for r in data.reviews if r.get("workflow_state") == "completed")
        completion_pct = (completed / total * 100) if total else 0.0
        counts = _completion_counts(data)
        zero_completed = sum(1 for c in counts.values() if c["completed"] == 0)
        avg_per_reviewer = (total / len(counts)) if counts else 0.0

        summary = md.kv(
            [
                ("assigned", total),
                ("completed", completed),
                ("completion rate", md.percent(completion_pct)),
                ("reviewers with 0 completed", zero_completed),
                ("average assigned per reviewer", round(avg_per_reviewer, 2)),
            ]
        )
        if not include_student_details:
            return md.join(summary, data.notice())

        rows = []
        for user_id, c in counts.items():
            submission = data.reviewees_by_user.get(user_id)
            user = submission.get("user") if submission else None
            rows.append(
                (app.person(user, fallback=f"user {user_id}"), c["assigned"], c["completed"], c["assigned"] - c["completed"])
            )
        table = md.table(["student", "assigned", "completed", "pending"], rows)
        return md.join(summary, md.section("Per-student", table), data.notice())

    @mcp.tool(annotations=READ)
    async def get_peer_review_followup_list(
        course: str | int,
        assignment_id: str | int,
        priority_filter: Priority | None = None,
        days_threshold: int = 3,
    ) -> str:
        """List students with pending peer reviews, ranked by follow-up priority.

        High priority: all assigned reviews pending and past due plus days_threshold.
        Medium priority: some but not all reviews pending. Low priority: everything else pending.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            priority_filter: Restrict to one priority level: high, medium, or low.
            days_threshold: Days past the due date before an all-pending reviewer is high priority.
        """
        _priority_filter_check(priority_filter)
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        rows_data = _followup_rows(data, days_threshold)
        if priority_filter:
            rows_data = [r for r in rows_data if r["priority"] == priority_filter]
        rows = [
            (
                app.person(r["user"], fallback=f"user {r['user_id']}"),
                r["pending"],
                r["days_past_due"],
                r["priority"],
            )
            for r in rows_data
        ]
        table = md.table(["student", "pending reviews", "days since due", "priority"], rows)
        return md.join(table, data.notice())

    @mcp.tool(annotations=READ)
    async def get_peer_review_comments(
        course: str | int,
        assignment_id: str | int,
        include_reviewer_info: bool = True,
        include_reviewee_info: bool = True,
    ) -> str:
        """List every comment an assessor left on a reviewee's submission for an assignment.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            include_reviewer_info: Show the reviewer's name.
            include_reviewee_info: Show the reviewee's name.
        """
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        headers = []
        if include_reviewer_info:
            headers.append("reviewer")
        if include_reviewee_info:
            headers.append("reviewee")
        headers += ["date", "comment"]
        rows = []
        for r in data.reviews:
            for c in _review_comments(r):
                row = []
                if include_reviewer_info:
                    row.append(app.person(r.get("assessor")))
                if include_reviewee_info:
                    row.append(app.person(_reviewee_user(r, data)))
                row.append(md.fmt_date(c.get("created_at")))
                row.append(c.get("comment"))
                rows.append(tuple(row))
        # Every comment column here was written by a student reviewer.
        rendered = md.table(headers, rows)
        rendered = md.untrusted(rendered, "peer review comments") if rows else rendered
        return md.join(rendered, data.notice())

    @mcp.tool(annotations=READ)
    async def analyze_peer_review_quality(
        course: str | int, assignment_id: str | int, min_words: int = 20
    ) -> str:
        """Score each peer review's comment quality on a 1-5 scale with heuristic flags.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            min_words: Minimum combined word count before a review is flagged "too short".
        """
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        rows = []
        scores: list[int] = []
        for r in data.reviews:
            comments = _review_comments(r)
            text = " ".join(c.get("comment") or "" for c in comments)
            score, specificity, flags = _quality_score(text, min_words)
            scores.append(score)
            rows.append(
                (
                    r.get("id"),
                    app.person(r.get("assessor")),
                    app.person(_reviewee_user(r, data)),
                    len(text.split()),
                    round(specificity, 2),
                    score,
                    ", ".join(flags) or md.NONE,
                )
            )
        table = md.table(
            ["review id", "reviewer", "reviewee", "words", "specificity", "score", "flags"], rows
        )
        distribution = {n: scores.count(n) for n in range(1, 6)}
        dist_rows = [(n, distribution[n]) for n in range(1, 6)]
        avg_score = round(sum(scores) / len(scores), 2) if scores else md.NONE
        summary = md.join(
            md.kv([("reviews analyzed", len(scores)), ("average score", avg_score)]),
            md.table(["score", "count"], dist_rows),
        )
        return md.join(table, md.section("Distribution", summary), data.notice())

    @mcp.tool(annotations=READ)
    async def identify_problematic_peer_reviews(course: str | int, assignment_id: str | int) -> str:
        """Flag peer reviews needing instructor attention: low quality, empty, duplicated, or comment-free.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
        """
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        text_counts: dict[str, int] = {}
        prepared = []
        for r in data.reviews:
            comments = _review_comments(r)
            text = " ".join(c.get("comment") or "" for c in comments).strip()
            normalized = text.casefold()
            if normalized:
                text_counts[normalized] = text_counts.get(normalized, 0) + 1
            prepared.append((r, text, normalized))

        rows = []
        for r, text, normalized in prepared:
            reasons = []
            if r.get("workflow_state") == "completed" and not text:
                reasons.append("completed with no comment")
            if text:
                score, _specificity, _flags = _quality_score(text, min_words=20)
                if score <= 2:
                    reasons.append(f"low quality score ({score})")
                if normalized and text_counts.get(normalized, 0) > 1:
                    reasons.append("duplicated text across reviews")
            elif r.get("workflow_state") != "completed":
                continue
            if not reasons:
                continue
            rows.append(
                (
                    r.get("id"),
                    app.person(r.get("assessor")),
                    app.person(_reviewee_user(r, data)),
                    r.get("workflow_state"),
                    "; ".join(reasons),
                )
            )
        if not rows:
            return md.join("_no problematic peer reviews found_", data.notice())
        table = md.table(["review id", "reviewer", "reviewee", "state", "reasons"], rows)
        return md.join(table, data.notice())

    @mcp.tool(annotations=READ)
    async def generate_peer_review_report(
        course: str | int,
        assignment_id: str | int,
        include_student_details: bool = True,
        save_to_file: bool = False,
        filename: str | None = None,
    ) -> str:
        """Generate a composed Markdown report: completion, quality, follow-ups, action items.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            include_student_details: Include the per-student completion breakdown.
            save_to_file: Save the report to disk instead of only returning it inline.
            filename: Custom filename when saving; defaults to a name derived from the assignment.
        """
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        course_name = await app.course_name(cid)

        total = len(data.reviews)
        completed = sum(1 for r in data.reviews if r.get("workflow_state") == "completed")
        counts = _completion_counts(data)
        zero_completed = sum(1 for c in counts.values() if c["completed"] == 0)
        completion_block = md.kv(
            [
                ("assigned", total),
                ("completed", completed),
                ("completion rate", md.percent(completed / total * 100 if total else 0)),
                ("reviewers with 0 completed", zero_completed),
            ]
        )
        if include_student_details:
            rows = []
            for user_id, c in counts.items():
                submission = data.reviewees_by_user.get(user_id)
                user = submission.get("user") if submission else None
                rows.append((app.person(user, fallback=f"user {user_id}"), c["assigned"], c["completed"], c["assigned"] - c["completed"]))
            completion_block = md.join(completion_block, md.table(["student", "assigned", "completed", "pending"], rows))

        scores = []
        for r in data.reviews:
            text = " ".join(c.get("comment") or "" for c in _review_comments(r))
            score, _spec, _flags = _quality_score(text, min_words=20)
            scores.append(score)
        avg_score = round(sum(scores) / len(scores), 2) if scores else md.NONE
        quality_block = md.kv([("reviews scored", len(scores)), ("average quality score", avg_score)])

        followups = _followup_rows(data, days_threshold=3)
        followup_rows = [
            (app.person(r["user"], fallback=f"user {r['user_id']}"), r["pending"], r["priority"])
            for r in followups
        ]
        followup_block = md.table(["student", "pending", "priority"], followup_rows)

        high_count = sum(1 for r in followups if r["priority"] == "high")
        action_items = []
        if high_count:
            action_items.append(f"Send urgent reminders to {high_count} student(s) with all reviews pending past due.")
        if zero_completed:
            action_items.append(f"{zero_completed} reviewer(s) have completed zero peer reviews.")
        low_quality = sum(1 for s in scores if s <= 2)
        if low_quality:
            action_items.append(f"{low_quality} review(s) scored 2 or below on quality and may need instructor follow-up.")
        if not action_items:
            action_items.append("No urgent action items identified.")

        report = md.join(
            md.heading(f"Peer Review Report: {data.assignment.get('name')}", 1),
            md.kv([("course", course_name), ("generated", md.fmt_date(datetime.now(UTC).isoformat()))]),
            md.section("Completion analytics", completion_block),
            md.section("Quality summary", quality_block),
            md.section("Follow-up list", followup_block),
            md.section("Action items", md.bullets(action_items)),
            data.notice(),
        )

        if not save_to_file:
            return report

        dest = _resolve_save_path(
            app, filename, f"peer_review_report_{assignment_id}", "md"
        )
        dest.write_text(report, encoding="utf-8")
        return md.join(report, md.section("Saved to", str(dest)))

    @mcp.tool(annotations=READ)
    async def generate_peer_review_feedback_report(
        course: str | int,
        assignment_id: str | int,
        report_type: str = "summary",
        include_student_names: bool = True,
    ) -> str:
        """Generate an instructor-facing report on the feedback students received.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            report_type: "summary" (aggregate stats), "detailed" (per-review comment table),
                or "student" (one section per reviewee with all feedback they received).
            include_student_names: Show resolved names instead of raw user ids.
        """
        allowed = {"summary", "detailed", "student"}
        if report_type not in allowed:
            raise ToolError(f"Invalid report_type {report_type!r}. Allowed: {', '.join(sorted(allowed))}.")
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)
        course_name = await app.course_name(cid)
        header = md.join(
            md.heading(f"Peer Review Feedback: {data.assignment.get('name')}", 1),
            md.kv([("course", course_name)]),
        )

        if report_type == "summary":
            per_reviewee: dict[int, list[str]] = {}
            for r in data.reviews:
                text = " ".join(c.get("comment") or "" for c in _review_comments(r))
                if text.strip():
                    per_reviewee.setdefault(r.get("user_id"), []).append(text)
            rows = []
            for user_id, texts in per_reviewee.items():
                submission = data.reviewees_by_user.get(user_id)
                user = submission.get("user") if submission else None
                name = app.person(user, fallback=f"user {user_id}") if include_student_names else user_id
                total_words = sum(len(t.split()) for t in texts)
                rows.append((name, len(texts), total_words))
            table = md.table(["reviewee", "feedback items", "total words"], rows)
            return md.join(header, table, data.notice())

        if report_type == "detailed":
            rows = []
            for r in data.reviews:
                reviewer = app.person(r.get("assessor")) if include_student_names else r.get("assessor_id")
                reviewee = (
                    app.person(_reviewee_user(r, data)) if include_student_names else r.get("user_id")
                )
                for c in _review_comments(r):
                    rows.append((reviewer, reviewee, md.fmt_date(c.get("created_at")), c.get("comment")))
            table = md.table(["reviewer", "reviewee", "date", "comment"], rows)
            return md.join(header, table, data.notice())

        blocks = [header]
        per_reviewee_reviews: dict[int, list[dict[str, Any]]] = {}
        for r in data.reviews:
            per_reviewee_reviews.setdefault(r.get("user_id"), []).append(r)
        for user_id, reviews in per_reviewee_reviews.items():
            submission = data.reviewees_by_user.get(user_id)
            user = submission.get("user") if submission else None
            name = app.person(user, fallback=f"user {user_id}") if include_student_names else f"user {user_id}"
            lines = []
            for r in reviews:
                reviewer = app.person(r.get("assessor")) if include_student_names else r.get("assessor_id")
                for c in _review_comments(r):
                    lines.append(f"- **{reviewer}** ({md.fmt_date(c.get('created_at'))}): {c.get('comment')}")
            body = (
                md.untrusted("\n".join(lines), "peer review feedback")
                if lines
                else "_no feedback received_"
            )
            blocks.append(md.section(name, body, level=3))
        blocks.append(data.notice())
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def extract_peer_review_dataset(
        course: str | int,
        assignment_id: str | int,
        output_format: str = "csv",
        anonymize: bool = True,
        save_locally: bool = False,
        filename: str | None = None,
    ) -> str:
        """Export peer review data as rows: review id, reviewer, reviewee, state, comment, word count, created_at.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            output_format: "csv" or "json".
            anonymize: Replace student names with stable anonymous ids.
            save_locally: Save the dataset to disk instead of returning it inline.
                Inline output is capped at 200 rows regardless of this flag.
            filename: Custom filename when saving.
        """
        if output_format not in {"csv", "json"}:
            raise ToolError(f"Invalid output_format {output_format!r}. Allowed: csv, json.")
        cid = await app.course_id(course)
        data = await _load(app, cid, assignment_id)

        def name_for(user: dict[str, Any] | None, user_id: Any) -> str:
            if anonymize:
                return app.anonymous_id(user_id)
            return app.person(user, fallback=f"user {user_id}")

        rows: list[dict[str, Any]] = []
        for r in data.reviews:
            reviewer = r.get("assessor")
            reviewee = _reviewee_user(r, data)
            comments = _review_comments(r)
            comment_text = " ".join(c.get("comment") or "" for c in comments)
            created_at = comments[0].get("created_at") if comments else None
            rows.append(
                {
                    "review_id": r.get("id"),
                    "reviewer": name_for(reviewer, r.get("assessor_id")),
                    "reviewee": name_for(reviewee, r.get("user_id")),
                    "state": r.get("workflow_state"),
                    "comment": comment_text,
                    "word_count": len(comment_text.split()),
                    "created_at": created_at,
                }
            )

        if save_locally:
            extension = "csv" if output_format == "csv" else "json"
            dest = _resolve_save_path(app, filename, f"peer_review_dataset_{assignment_id}", extension)
            if output_format == "csv":
                buffer = io.StringIO()
                writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()) if rows else [])
                writer.writeheader()
                writer.writerows(rows)
                dest.write_text(buffer.getvalue(), encoding="utf-8")
            else:
                dest.write_text(json.dumps(rows, indent=2), encoding="utf-8")
            return md.done(
                "extract_peer_review_dataset",
                md.join(
                    md.kv([("path", str(dest)), ("rows", len(rows)), ("format", output_format)]),
                    data.notice(),
                ),
            )

        capped_rows = rows[:200]
        note = f"\n\n_Showing {len(capped_rows)} of {len(rows)} rows; set save_locally=true for the full dataset._" if len(rows) > 200 else ""
        if data.capped:
            note += f"\n\n{data.notice()}"
        if output_format == "csv":
            buffer = io.StringIO()
            writer = csv.DictWriter(buffer, fieldnames=list(capped_rows[0].keys()) if capped_rows else [])
            writer.writeheader()
            writer.writerows(capped_rows)
            return f"```csv\n{buffer.getvalue()}```{note}"
        return f"```json\n{json.dumps(capped_rows, indent=2)}\n```{note}"

    @mcp.tool(annotations=DESTRUCTIVE)
    async def message_peer_reviewers(
        course: str | int,
        assignment_id: str | int,
        recipient_ids: list[int],
        custom_message: str | None = None,
        include_assignment_link: bool = True,
        subject_prefix: str = "Peer review reminder",
        confirm: bool = False,
    ) -> str:
        """Send Canvas inbox messages to students about incomplete peer reviews.

        Requires manage_grades permission in the course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            recipient_ids: Canvas user ids to message.
            custom_message: Custom message body. Defaults to a template naming their pending count.
            include_assignment_link: Append a direct link to the assignment.
            subject_prefix: Prefix for the message subject line.
            confirm: Must be true to actually send.
        """
        if not recipient_ids:
            raise ToolError("recipient_ids must not be empty.")
        cid = await app.course_id(course)
        await _require_manage_grades(app, cid)
        data = await _load(app, cid, assignment_id)
        counts = _completion_counts(data)

        subject = f"{subject_prefix}: {data.assignment.get('name')}"
        bodies: dict[int, str] = {}
        preview_rows = []
        for uid in recipient_ids:
            pending = counts.get(uid, {}).get("assigned", 0) - counts.get(uid, {}).get("completed", 0)
            submission = data.reviewees_by_user.get(uid)
            user = submission.get("user") if submission else None
            body = custom_message or _compose_followup_body(
                "medium", data.assignment.get("name"), max(pending, 0), data.assignment.get("due_at")
            )
            if include_assignment_link and data.assignment.get("html_url"):
                body = f"{body}\n\n{data.assignment['html_url']}"
            bodies[uid] = body
            preview_rows.append((app.person(user, fallback=f"user {uid}"), pending))

        details = md.join(
            md.kv([("subject", subject)]),
            md.table(["recipient", "pending reviews"], preview_rows),
            data.notice(),
        )
        if not confirm:
            return md.preview("message_peer_reviewers", details)

        results = await _send_conversations(app, cid, recipient_ids, subject, bodies)
        return md.done("message_peer_reviewers", md.join(md.table(["user id", "result"], results), data.notice()))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def send_peer_review_followups(
        course: str | int, assignment_id: str | int, confirm: bool = False
    ) -> str:
        """Build the follow-up list and send a tiered reminder message to every pending reviewer.

        High priority reviewers get a firm overdue notice; medium priority get a plain reminder.
        Low priority reviewers are not messaged.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            confirm: Must be true to actually send.
        """
        cid = await app.course_id(course)
        await _require_manage_grades(app, cid)
        data = await _load(app, cid, assignment_id)
        followups = _followup_rows(data, days_threshold=3)
        tiers = {"high": [r for r in followups if r["priority"] == "high"], "medium": [r for r in followups if r["priority"] == "medium"]}

        subject = f"Peer review reminder: {data.assignment.get('name')}"
        bodies: dict[int, str] = {}
        batch_blocks = []
        recipient_ids: list[int] = []
        for tier, rows in tiers.items():
            if not rows:
                continue
            batch_rows = []
            for r in rows:
                body = _compose_followup_body(tier, data.assignment.get("name"), r["pending"], data.assignment.get("due_at"))
                if data.assignment.get("html_url"):
                    body = f"{body}\n\n{data.assignment['html_url']}"
                bodies[r["user_id"]] = body
                recipient_ids.append(r["user_id"])
                batch_rows.append((app.person(r["user"], fallback=f"user {r['user_id']}"), r["pending"]))
            batch_blocks.append(
                md.section(
                    f"{tier} priority ({len(rows)})",
                    md.join(md.table(["student", "pending"], batch_rows), md.section("Message body", bodies[rows[0]["user_id"]], level=4)),
                    level=3,
                )
            )

        if not recipient_ids:
            return md.join("_no students have pending peer reviews; nothing to send_", data.notice())

        details = md.join(md.kv([("subject", subject)]), *batch_blocks, data.notice())
        if not confirm:
            return md.preview("send_peer_review_followups", details)

        results = await _send_conversations(app, cid, recipient_ids, subject, bodies)
        return md.done("send_peer_review_followups", md.join(md.table(["user id", "result"], results), data.notice()))
