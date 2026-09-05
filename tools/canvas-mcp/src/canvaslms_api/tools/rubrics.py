from __future__ import annotations

import csv
import io
from typing import Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import READ, WRITE, App


def _flatten_criteria(criteria: list[dict[str, Any]]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for i, criterion in enumerate(criteria):
        description = criterion.get("description")
        if not description:
            raise ToolError(f"Criterion at index {i} is missing 'description'.")
        points = criterion.get("points")
        if points is None:
            raise ToolError(f"Criterion {description!r} is missing 'points'.")
        prefix = f"rubric[criteria][{i}]"
        data[f"{prefix}[description]"] = description
        data[f"{prefix}[points]"] = points
        if criterion.get("long_description"):
            data[f"{prefix}[long_description]"] = criterion["long_description"]
        ratings = criterion.get("ratings") or [
            {"description": "Full Marks", "points": points},
            {"description": "No Marks", "points": 0},
        ]
        for j, rating in enumerate(ratings):
            rprefix = f"{prefix}[ratings][{j}]"
            data[f"{rprefix}[description]"] = rating.get("description", "")
            data[f"{rprefix}[points]"] = rating.get("points")
            if rating.get("long_description"):
                data[f"{rprefix}[long_description]"] = rating["long_description"]
    return data


async def _create_rubric(
    app: App,
    cid: int,
    title: str,
    criteria: list[dict[str, Any]],
    assignment_id: str | int | None,
    use_for_grading: bool,
    reusable: bool,
    free_form_criterion_comments: bool,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "rubric[title]": title,
        "rubric[free_form_criterion_comments]": free_form_criterion_comments,
        "rubric[reusable]": reusable,
    }
    data.update(_flatten_criteria(criteria))
    if assignment_id is not None:
        data["rubric_association_id"] = ""
        data["rubric_association[association_id]"] = assignment_id
        data["rubric_association[association_type]"] = "Assignment"
        data["rubric_association[use_for_grading]"] = use_for_grading
        data["rubric_association[purpose]"] = "grading"
    return await app.client.post(f"/courses/{cid}/rubrics", data=data)


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_rubrics(course: str | int, include_criteria: bool = False) -> str:
        """List all rubrics in a course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            include_criteria: Also show each rubric's criteria as a nested list.
        """
        cid = await app.course_id(course)
        rubrics = await app.client.get_all(f"/courses/{cid}/rubrics")
        rows = [
            (r.get("id"), r.get("title"), r.get("points_possible"), len(r.get("data") or []))
            for r in rubrics
        ]
        table = md.table(["id", "title", "points possible", "criteria count"], rows)
        notice = md.capped_notice(len(rubrics)) if rubrics.capped else ""
        if not include_criteria:
            return md.join(table, notice)
        blocks = [table]
        for r in rubrics:
            criteria = r.get("data") or []
            lines = [
                f"{c.get('description')} ({c.get('points')} pts)" for c in criteria
            ]
            blocks.append(md.section(r.get("title") or f"Rubric {r.get('id')}", md.bullets(lines), level=3))
        blocks.append(notice)
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def get_rubric(
        course: str | int,
        rubric_id: str | int | None = None,
        assignment_id: str | int | None = None,
    ) -> str:
        """Get a rubric's criteria, ratings, and points. Give exactly one of rubric_id or assignment_id.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            rubric_id: Canvas rubric id for a direct lookup.
            assignment_id: Canvas assignment id; the rubric attached to it is returned.
        """
        if (rubric_id is None) == (assignment_id is None):
            raise ToolError("Give exactly one of rubric_id or assignment_id.")
        cid = await app.course_id(course)
        if assignment_id is not None:
            assignment = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")
            criteria = assignment.get("rubric") or []
            settings = assignment.get("rubric_settings") or {}
            title = settings.get("title") or "Rubric"
            points_possible = settings.get("points_possible")
        else:
            rubric = await app.client.get(f"/courses/{cid}/rubrics/{rubric_id}")
            criteria = rubric.get("data") or []
            title = rubric.get("title")
            points_possible = rubric.get("points_possible")
        if not criteria:
            raise ToolError("No rubric found for the given course/rubric_id/assignment_id.")
        rows = []
        for c in criteria:
            ratings = "; ".join(
                f"{r.get('points')}: {r.get('description')}" for r in c.get("ratings") or []
            )
            rows.append((c.get("id"), c.get("description"), c.get("points"), ratings))
        table = md.table(["id", "description", "points", "ratings"], rows)
        return md.join(md.kv([("title", title), ("points possible", points_possible)]), table)

    @mcp.tool(annotations=READ)
    async def get_rubric_assessment(course: str | int, assignment_id: str | int, user_id: str | int) -> str:
        """Get a submission's rubric assessment: per-criterion points, rating, and comments.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            assignment_id: Canvas assignment id.
            user_id: Canvas user id of the student.
        """
        cid = await app.course_id(course)
        submission = await app.client.get(
            f"/courses/{cid}/assignments/{assignment_id}/submissions/{user_id}",
            {"include[]": ["rubric_assessment"]},
        )
        assessment = submission.get("rubric_assessment")
        if not assessment:
            raise ToolError("This submission has no rubric assessment yet.")
        assignment = await app.client.get(f"/courses/{cid}/assignments/{assignment_id}")
        criteria_by_id = {c.get("id"): c for c in assignment.get("rubric") or []}
        rows = []
        total = 0.0
        for criterion_id, result in assessment.items():
            criterion = criteria_by_id.get(criterion_id, {})
            points = result.get("points")
            rating = next(
                (r.get("description") for r in criterion.get("ratings") or [] if r.get("points") == points),
                "",
            )
            rows.append(
                (criterion.get("description") or criterion_id, points, rating, result.get("comments") or "")
            )
            total += float(points or 0)
        table = md.table(["criterion", "points", "rating", "comments"], rows)
        return md.join(table, f"**Total:** {total} / {assignment.get('points_possible')}")

    @mcp.tool(annotations=WRITE)
    async def create_rubric(
        course: str | int,
        title: str,
        criteria: list[dict[str, Any]],
        assignment_id: str | int | None = None,
        use_for_grading: bool = False,
        reusable: bool = True,
        free_form_criterion_comments: bool = False,
        confirm: bool = False,
    ) -> str:
        """Create a rubric in a course, optionally associating it with an assignment.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            title: Rubric title.
            criteria: List of {"description": str, "points": number, "long_description"?: str,
                "ratings"?: [{"description", "points", "long_description"?}]}. When ratings
                are omitted, Full Marks / No Marks ratings are generated.
            assignment_id: Optional assignment id to immediately associate the rubric with.
            use_for_grading: When associating with an assignment, use the rubric for grade calculation.
            reusable: Make the rubric reusable across courses (default: true).
            free_form_criterion_comments: Allow free-form comments per criterion instead of rating selection.
            confirm: Must be true to actually create the rubric.
        """
        if not criteria:
            raise ToolError("criteria must not be empty.")
        cid = await app.course_id(course)
        total_points = sum(float(c.get("points") or 0) for c in criteria)
        if not confirm:
            rows = [
                (
                    c.get("description"),
                    c.get("points"),
                    len(c.get("ratings") or []) or 2,
                )
                for c in criteria
            ]
            details = md.join(
                md.kv(
                    [
                        ("course", await app.course_name(cid)),
                        ("title", title),
                        ("total points", total_points),
                        ("assignment_id", assignment_id or md.NONE),
                    ]
                ),
                md.table(["criterion", "points", "ratings"], rows),
            )
            return md.preview("create_rubric", details)
        result = await _create_rubric(
            app, cid, title, criteria, assignment_id, use_for_grading, reusable, free_form_criterion_comments
        )
        rubric = result.get("rubric") or result
        details = md.kv(
            [
                ("id", rubric.get("id")),
                ("title", rubric.get("title")),
                ("points possible", rubric.get("points_possible")),
                ("association", "assignment " + str(assignment_id) if assignment_id else "none"),
            ]
        )
        return md.done("create_rubric", details)

    @mcp.tool(annotations=WRITE)
    async def create_rubric_from_csv(course: str | int, csv_content: str, confirm: bool = False) -> str:
        """Create one or more rubrics in a course from a CSV string.

        Columns: rubric_title, criterion, criterion_description (optional), points, then
        either rating columns as pairs rating_description_N/rating_points_N, or a single
        'ratings' column formatted "desc:points;desc:points".

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            csv_content: The CSV file content as a string.
            confirm: Must be true to actually create the rubrics.
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        if reader.fieldnames is None:
            raise ToolError("csv_content has no header row.")
        fieldnames = reader.fieldnames
        rating_pairs = sorted(
            {
                int(f.rsplit("_", 1)[1])
                for f in fieldnames
                if f.startswith("rating_description_") and f.rsplit("_", 1)[1].isdigit()
            }
        )
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row_num, row in enumerate(reader, start=2):
            title = (row.get("rubric_title") or "").strip()
            criterion_desc = (row.get("criterion") or "").strip()
            if not title or not criterion_desc:
                raise ToolError(f"Row {row_num}: rubric_title and criterion are required.")
            points_raw = (row.get("points") or "").strip()
            if not points_raw:
                raise ToolError(f"Row {row_num}: points is required.")
            try:
                points = float(points_raw)
            except ValueError as exc:
                raise ToolError(f"Row {row_num}: points {points_raw!r} is not a number.") from exc
            ratings: list[dict[str, Any]] = []
            ratings_col = (row.get("ratings") or "").strip()
            if ratings_col:
                for part in ratings_col.split(";"):
                    part = part.strip()
                    if not part or ":" not in part:
                        continue
                    desc, _, pts = part.rpartition(":")
                    try:
                        ratings.append({"description": desc.strip(), "points": float(pts.strip())})
                    except ValueError as exc:
                        raise ToolError(f"Row {row_num}: bad ratings entry {part!r}.") from exc
            else:
                for n in rating_pairs:
                    desc = (row.get(f"rating_description_{n}") or "").strip()
                    pts = (row.get(f"rating_points_{n}") or "").strip()
                    if not desc:
                        continue
                    try:
                        ratings.append({"description": desc, "points": float(pts) if pts else 0})
                    except ValueError as exc:
                        raise ToolError(f"Row {row_num}: bad rating_points_{n} {pts!r}.") from exc
            criterion: dict[str, Any] = {"description": criterion_desc, "points": points}
            if row.get("criterion_description"):
                criterion["long_description"] = row["criterion_description"].strip()
            if ratings:
                criterion["ratings"] = ratings
            grouped.setdefault(title, []).append(criterion)

        if not grouped:
            raise ToolError("No rubric rows found in csv_content.")

        if not confirm:
            blocks = []
            for title, criteria in grouped.items():
                rows = [(c.get("description"), c.get("points"), len(c.get("ratings") or []) or 2) for c in criteria]
                blocks.append(md.section(title, md.table(["criterion", "points", "ratings"], rows), level=3))
            return md.preview("create_rubric_from_csv", md.join(*blocks))

        cid = await app.course_id(course)
        created = []
        failed = []
        for title, criteria in grouped.items():
            try:
                result = await _create_rubric(app, cid, title, criteria, None, False, True, False)
                rubric = result.get("rubric") or result
                created.append((rubric.get("id"), rubric.get("title"), rubric.get("points_possible")))
            except Exception as exc:
                failed.append((title, str(exc)))
        details = md.join(
            md.section("Created", md.table(["id", "title", "points possible"], created) if created else "_none_"),
            md.section("Failed", md.table(["title", "error"], failed) if failed else "_none_"),
        )
        return md.done("create_rubric_from_csv", details)

    @mcp.tool(annotations=WRITE)
    async def associate_rubric(
        course: str | int,
        rubric_id: str | int,
        assignment_id: str | int,
        use_for_grading: bool = True,
        purpose: str = "grading",
        confirm: bool = False,
    ) -> str:
        """Associate an existing rubric with an assignment.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            rubric_id: Id of the rubric to associate.
            assignment_id: Id of the assignment to associate it with.
            use_for_grading: Use the rubric for grade calculation.
            purpose: Association purpose: "grading" or "bookmark".
            confirm: Must be true to actually create the association.
        """
        if purpose not in {"grading", "bookmark"}:
            raise ToolError("purpose must be 'grading' or 'bookmark'.")
        cid = await app.course_id(course)
        if not confirm:
            details = md.kv(
                [
                    ("course", await app.course_name(cid)),
                    ("rubric_id", rubric_id),
                    ("assignment_id", assignment_id),
                    ("use_for_grading", use_for_grading),
                    ("purpose", purpose),
                ]
            )
            return md.preview("associate_rubric", details)
        result = await app.client.post(
            f"/courses/{cid}/rubric_associations",
            data={
                "rubric_association[rubric_id]": rubric_id,
                "rubric_association[association_id]": assignment_id,
                "rubric_association[association_type]": "Assignment",
                "rubric_association[use_for_grading]": use_for_grading,
                "rubric_association[purpose]": purpose,
            },
        )
        details = md.kv(
            [
                ("association id", result.get("id")),
                ("rubric id", result.get("rubric_id")),
                ("assignment id", result.get("association_id")),
                ("use for grading", result.get("use_for_grading")),
            ]
        )
        return md.done("associate_rubric", details)
