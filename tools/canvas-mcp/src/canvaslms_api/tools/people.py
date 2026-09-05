from __future__ import annotations

import csv
import tempfile
from pathlib import Path
from typing import Any, Literal, get_args

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import READ, WRITE, App

# Closed vocabularies are Literal so FastMCP emits a JSON Schema `enum`
# and a client can reject a bad value before the call. Prose in an `Args:`
# block cannot; the model would learn the set by eating a ToolError.
# Runtime checks are kept — a schema binds a well-behaved client only.
Role = Literal["student", "teacher", "ta", "observer", "designer"]

ROLES = set(get_args(Role))


def _enrollment_summary(enrollments: list[dict[str, Any]]) -> tuple[str, str, str]:
    roles = ", ".join(sorted({e.get("type") or e.get("role") or "" for e in enrollments} - {""})) or md.NONE
    states = ", ".join(sorted({e.get("enrollment_state") or "" for e in enrollments} - {""})) or md.NONE
    sections = ", ".join(sorted({str(e.get("course_section_id") or "") for e in enrollments} - {""})) or md.NONE
    return roles, states, sections


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_users(course: str | int, role: Role | None = None) -> str:
        """List users enrolled in a course, with role, state, and section.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            role: Restrict to one enrollment type: student, teacher, ta, observer, or designer.
        """
        if role is not None and role not in ROLES:
            raise ToolError(f"role must be one of {sorted(ROLES)}.")
        cid = await app.course_id(course)
        params: dict[str, Any] = {"include[]": ["enrollments"]}
        if role:
            params["enrollment_type[]"] = [role]
        users = await app.client.get_all(f"/courses/{cid}/users", params)
        rows = []
        for user in users:
            roles, states, sections = _enrollment_summary(user.get("enrollments") or [])
            rows.append((user.get("id"), app.person(user), roles, states, sections))
        table = md.table(["id", "name", "role(s)", "state(s)", "section(s)"], rows)
        if users.capped:
            table += f"\n\n{md.capped_notice(len(users))}"
        return table

    @mcp.tool(annotations=READ)
    async def list_groups(course: str | int) -> str:
        """List a course's groups with their category, member count, and members.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
        """
        cid = await app.course_id(course)
        categories, groups = await app.client.gather(
            [
                app.client.get_all(f"/courses/{cid}/group_categories"),
                app.client.get_all(f"/courses/{cid}/groups", {"include[]": ["users"]}),
            ]
        )
        category_names = {c.get("id"): c.get("name") for c in categories}
        member_capped = False
        rows = []
        for group in groups:
            members = group.get("users")
            if members is None:
                members = await app.client.get_all(f"/groups/{group['id']}/users")
                member_capped = member_capped or members.capped
            member_names = ", ".join(app.person(m) for m in members) or md.NONE
            rows.append(
                (
                    category_names.get(group.get("group_category_id"), md.NONE),
                    group.get("name"),
                    group.get("id"),
                    len(members),
                    member_names,
                )
            )
        table = md.table(["category", "group", "id", "members", "member names"], rows)
        if groups.capped:
            table += f"\n\n{md.capped_notice(len(groups))}"
        if member_capped:
            table += "\n\n_One or more groups' member lists were capped at 1000 and more exist. Narrow the query to see the rest._"
        return table

    @mcp.tool(annotations=READ)
    async def check_enrollment(
        course: str | int, login_id: str, role: Role | None = None, active_only: bool = True
    ) -> str:
        """Check whether a specific login id is enrolled in a course. Never returns the roster.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            login_id: Campus login id, SIS user id, or email to check. Matched exactly.
            role: Restrict the match to one enrollment type: student, teacher, ta, observer, or designer.
            active_only: Only count active enrollments.
        """
        if role is not None and role not in ROLES:
            raise ToolError(f"role must be one of {sorted(ROLES)}.")
        needle = login_id.strip().casefold()
        if not needle:
            raise ToolError("login_id cannot be empty.")

        cid = await app.course_id(course)
        params: dict[str, Any] = {"search_term": login_id, "include[]": ["enrollments", "email"]}
        if role:
            params["enrollment_type[]"] = [role]
        candidates = await app.client.get_all(f"/courses/{cid}/search_users", params)

        matches = []
        for user in candidates:
            fields = {
                str(user.get("login_id") or "").casefold(),
                str(user.get("sis_user_id") or "").casefold(),
                str(user.get("email") or "").casefold(),
            }
            if needle not in fields:
                continue
            enrollments = user.get("enrollments") or []
            if active_only:
                enrollments = [e for e in enrollments if e.get("enrollment_state") == "active"]
            if role:
                enrollments = [e for e in enrollments if e.get("type") == role]
            if enrollments:
                matches.append(enrollments)

        cap_notice = md.capped_notice(len(candidates)) if candidates.capped else ""
        if not matches:
            return md.join("**NOT ENROLLED**", cap_notice)
        if len(matches) > 1:
            return md.join(f"**AMBIGUOUS** ({len(matches)} matching accounts found)", cap_notice)

        roles, states, _ = _enrollment_summary(matches[0])
        return md.join("**ENROLLED**", md.kv([("role(s)", roles), ("state(s)", states)]), cap_notice)

    @mcp.tool(annotations=WRITE)
    async def export_anonymization_map(
        course: str | int, save_directory: str | None = None, confirm: bool = False
    ) -> str:
        """Write a local CSV mapping each enrolled student's real name and id to their anonymous id.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            save_directory: Local directory to save into. Defaults to the configured
                download directory, or the system temp directory.
            confirm: Must be true to write the file; otherwise returns a preview.
        """
        cid = await app.course_id(course)
        students = await app.client.get_all(
            f"/courses/{cid}/users", {"enrollment_type[]": ["student"]}
        )

        target_dir = Path(save_directory) if save_directory else app.settings.download_dir
        if target_dir is None:
            target_dir = Path(tempfile.gettempdir())
        target_dir = target_dir.expanduser().resolve()
        if not target_dir.is_dir():
            raise ToolError(f"save_directory {target_dir} does not exist or is not a directory.")

        course_name = await app.course_name(cid)
        safe_stem = "".join(c if c.isalnum() else "_" for c in course_name).strip("_") or str(cid)
        dest = target_dir / f"{safe_stem}_anonymization_map.csv"
        counter = 1
        while dest.exists():
            dest = target_dir / f"{safe_stem}_anonymization_map ({counter}).csv"
            counter += 1

        details = md.kv(
            [
                ("course", course_name),
                ("student count", len(students)),
                ("destination", str(dest)),
            ]
        )
        if students.capped:
            details = md.join(details, md.capped_notice(len(students)))
        if not confirm:
            return md.preview("export_anonymization_map", details)

        with dest.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            writer.writerow(["real_name", "canvas_user_id", "anonymous_id"])
            for student in students:
                name = (
                    student.get("name")
                    or student.get("sortable_name")
                    or student.get("short_name")
                    or "unknown"
                )
                writer.writerow([name, student.get("id"), app.anonymous_id(student.get("id"))])

        return md.done("export_anonymization_map", details)

    @mcp.tool(annotations=READ)
    async def get_privacy_status() -> str:
        """Report the current student-anonymization configuration."""
        return md.kv(
            [
                ("anonymization", "on" if app.settings.anonymize_students else "off"),
                ("setting", "CANVAS_ANONYMIZE_STUDENTS"),
                (
                    "id derivation",
                    "sha256(host:canvas_user_id), first 8 hex chars, formatted Student_<hex>",
                ),
                (
                    "honored by",
                    "any tool that renders a person's name via app.person(), "
                    "e.g. list_users, list_groups, list_submissions, get_student_analytics",
                ),
            ]
        )
