from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import DESTRUCTIVE, READ, WRITE, App
from ..client import CanvasError


def _topic_type(topic: dict[str, Any]) -> str:
    return "Announcement" if topic.get("is_announcement") else "Discussion"


def _topic_flags(topic: dict[str, Any]) -> str:
    flags = []
    if topic.get("locked"):
        flags.append("locked")
    if topic.get("pinned"):
        flags.append("pinned")
    return ", ".join(flags) or md.NONE


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_discussion_topics(course: str | int, include_announcements: bool = False) -> str:
        """List discussion topics in a course.

        Announcements are excluded by default; set include_announcements to
        merge them into the same table.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            include_announcements: Also include the course's announcements.
        """
        cid = await app.course_id(course)
        topics = await app.client.get_all(f"/courses/{cid}/discussion_topics")
        capped = topics.capped
        if include_announcements:
            announcements = await app.client.get_all(
                f"/courses/{cid}/discussion_topics", {"only_announcements": True}
            )
            capped = capped or announcements.capped
            seen = {t.get("id") for t in topics}
            topics.extend(a for a in announcements if a.get("id") not in seen)
        rows = [
            (
                t.get("id"),
                t.get("title"),
                _topic_type(t),
                md.fmt_date(t.get("posted_at")),
                t.get("discussion_subentry_count"),
                t.get("unread_count"),
                "yes" if t.get("assignment_id") else "no",
                _topic_flags(t),
                t.get("html_url"),
            )
            for t in topics
        ]
        table = md.table(
            ["id", "title", "type", "posted", "replies", "unread", "graded", "flags", "url"], rows
        )
        if capped:
            table += f"\n\n{md.capped_notice(len(topics))}"
        return table

    @mcp.tool(annotations=READ)
    async def get_discussion_topic(course: str | int, topic_id: str | int) -> str:
        """Get full details for one discussion topic or announcement.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            topic_id: Discussion topic id.
        """
        cid = await app.course_id(course)
        topic = await app.client.get(f"/courses/{cid}/discussion_topics/{topic_id}")
        author = app.person(topic.get("author"))
        assignment = topic.get("assignment") or {}
        body = md.kv(
            [
                ("title", topic.get("title")),
                ("id", topic.get("id")),
                ("type", _topic_type(topic)),
                ("author", author),
                ("posted", md.fmt_date(topic.get("posted_at"))),
                ("delayed post at", md.fmt_date(topic.get("delayed_post_at"))),
                ("lock at", md.fmt_date(topic.get("lock_at"))),
                ("reply count", topic.get("discussion_subentry_count")),
                ("unread count", topic.get("unread_count")),
                ("requires initial post", topic.get("require_initial_post")),
                ("pinned", topic.get("pinned")),
                ("locked", topic.get("locked")),
                ("published", topic.get("published")),
                (
                    "graded assignment",
                    f"{assignment.get('name')} (id {assignment.get('id')}, "
                    f"{md.points(None, None) if not assignment else md.cell(assignment.get('points_possible'))} pts)"
                    if assignment.get("id")
                    else md.NONE,
                ),
            ]
        )
        message = md.html_to_text(topic.get("message"), 4000)
        return md.join(body, md.section("Message", message or "_no message_"))

    @mcp.tool(annotations=READ)
    async def list_discussion_entries(course: str | int, topic_id: str | int) -> str:
        """List the top-level posts in a discussion topic.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            topic_id: Discussion topic id.
        """
        cid = await app.course_id(course)
        entries = await app.client.get_all(f"/courses/{cid}/discussion_topics/{topic_id}/entries")
        rows = [
            (
                e.get("id"),
                app.person(e.get("user")),
                md.fmt_date(e.get("created_at")),
                e.get("recent_replies_count") if e.get("recent_replies_count") is not None
                else e.get("recent_replies") and len(e["recent_replies"]),
                md.html_to_text(e.get("message"), 200),
            )
            for e in entries
        ]
        table = md.table(["id", "author", "posted", "replies", "preview"], rows)
        if entries.capped:
            table += f"\n\n{md.capped_notice(len(entries))}"
        return table

    @mcp.tool(annotations=READ)
    async def get_discussion_entry(
        course: str | int, topic_id: str | int, entry_id: str | int, include_replies: bool = True
    ) -> str:
        """Get one discussion entry in full, optionally with its replies.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            topic_id: Discussion topic id.
            entry_id: Discussion entry id.
            include_replies: Fetch and include replies to this entry.
        """
        cid = await app.course_id(course)
        entries = await app.client.get_all(f"/courses/{cid}/discussion_topics/{topic_id}/entries")
        entry = next((e for e in entries if str(e.get("id")) == str(entry_id)), None)
        if entry is None:
            hint = f" {md.capped_notice(len(entries))}" if entries.capped else ""
            raise ToolError(f"No entry {entry_id} found in topic {topic_id}.{hint}")
        body = md.kv(
            [
                ("id", entry.get("id")),
                ("author", app.person(entry.get("user"))),
                ("posted", md.fmt_date(entry.get("created_at"))),
                ("updated", md.fmt_date(entry.get("updated_at"))),
            ]
        )
        # Fenced per SECTION, not per line: a fence around every bullet would be
        # unreadable, and the boundary the model needs is "everything in this
        # block was written by course participants".
        text = md.html_to_text(entry.get("message"), 1500)
        message = md.section(
            "Message", md.untrusted(text, "discussion entry") if text else "_no message_"
        )
        blocks = [body, message]
        if include_replies:
            replies = await app.client.get_all(
                f"/courses/{cid}/discussion_topics/{topic_id}/entries/{entry_id}/replies"
            )
            if replies:
                lines = [
                    f"- **{app.person(r.get('user'))}** ({md.fmt_date(r.get('created_at'))}): "
                    f"{md.html_to_text(r.get('message'), 1500)}"
                    for r in replies
                ]
                blocks.append(
                    md.section("Replies", md.untrusted("\n".join(lines), "discussion replies"))
                )
            else:
                blocks.append(md.section("Replies", "_none_"))
            if replies.capped:
                blocks.append(md.capped_notice(len(replies)))
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def get_discussion_thread(
        course: str | int, topic_id: str | int, include_replies: bool = True
    ) -> str:
        """Get the whole discussion as one nested conversation tree.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            topic_id: Discussion topic id.
            include_replies: Include nested replies; if False, only top-level entries are shown.
        """
        cid = await app.course_id(course)
        topic = await app.client.get(f"/courses/{cid}/discussion_topics/{topic_id}")
        view = await app.client.get(f"/courses/{cid}/discussion_topics/{topic_id}/view")
        participants = {p.get("id"): p for p in (view.get("participants") or [])}

        blocks = [
            md.heading(topic.get("title") or f"Topic {topic_id}", 2),
            md.html_to_text(topic.get("message"), 2000) or "_no message_",
        ]

        def count_all(entries: list[dict[str, Any]]) -> int:
            total = len(entries)
            if include_replies:
                for entry in entries:
                    total += count_all(entry.get("replies") or [])
            return total

        count = 0
        truncated = False
        lines: list[str] = []

        def walk(entries: list[dict[str, Any]], depth: int) -> None:
            nonlocal count, truncated
            for entry in entries:
                if count >= 300:
                    truncated = True
                    return
                count += 1
                indent = "  " * min(depth, 6)
                author = app.person(participants.get(entry.get("user_id")))
                text = md.html_to_text(entry.get("message"), 800)
                deleted = " _[deleted]_" if entry.get("deleted") else ""
                lines.append(f"{indent}- **{author}** ({md.fmt_date(entry.get('created_at'))}): {text}{deleted}")
                if include_replies:
                    children = entry.get("replies") or []
                    if children:
                        walk(children, depth + 1)
                if truncated:
                    return

        tree = view.get("view") or []
        total_entries = count_all(tree)
        walk(tree, 0)
        blocks.append(
            md.section(
                "Conversation",
                md.untrusted("\n".join(lines), "discussion thread") if lines else "_no entries_",
            )
        )
        if truncated:
            blocks.append(f"_Showing 300 of {total_entries} entries; the list was truncated. Narrow the query to see the rest._")
        return md.join(*blocks)

    @mcp.tool(annotations=WRITE)
    async def post_discussion_entry(
        course: str | int, topic_id: str | int, message: str, confirm: bool = False
    ) -> str:
        """Post a new top-level entry to a discussion topic.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            topic_id: Discussion topic id.
            message: Entry message content.
            confirm: Set true to actually post; without it, only a preview is returned.
        """
        if not message.strip():
            raise ToolError("message cannot be empty.")
        cid = await app.course_id(course)
        topic = await app.client.get(f"/courses/{cid}/discussion_topics/{topic_id}")
        details = md.kv([("topic", topic.get("title")), ("message", message)])
        if not confirm:
            return md.preview("post_discussion_entry", details)
        created = await app.client.post(
            f"/courses/{cid}/discussion_topics/{topic_id}/entries", json={"message": message}
        )
        return md.done("post_discussion_entry", md.kv([("entry id", created.get("id")), ("topic", topic.get("title"))]))

    @mcp.tool(annotations=WRITE)
    async def reply_to_discussion_entry(
        course: str | int, topic_id: str | int, entry_id: str | int, message: str, confirm: bool = False
    ) -> str:
        """Reply to an existing discussion entry.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            topic_id: Discussion topic id.
            entry_id: Discussion entry id to reply to.
            message: Reply message content.
            confirm: Set true to actually post; without it, only a preview is returned.
        """
        if not message.strip():
            raise ToolError("message cannot be empty.")
        cid = await app.course_id(course)
        entries = await app.client.get_all(f"/courses/{cid}/discussion_topics/{topic_id}/entries")
        parent = next((e for e in entries if str(e.get("id")) == str(entry_id)), None)
        details = md.kv(
            [
                ("parent author", app.person(parent.get("user")) if parent else "unknown"),
                ("parent preview", md.html_to_text(parent.get("message"), 200) if parent else md.NONE),
                ("your reply", message),
            ]
        )
        if parent is None and entries.capped:
            details = md.join(details, md.capped_notice(len(entries)))
        if not confirm:
            return md.preview("reply_to_discussion_entry", details)
        created = await app.client.post(
            f"/courses/{cid}/discussion_topics/{topic_id}/entries/{entry_id}/replies",
            json={"message": message},
        )
        return md.done("reply_to_discussion_entry", md.kv([("reply id", created.get("id"))]))

    @mcp.tool(annotations=WRITE)
    async def create_discussion_topic(
        course: str | int,
        title: str,
        message: str,
        delayed_post_at: str | None = None,
        lock_at: str | None = None,
        require_initial_post: bool = False,
        pinned: bool = False,
        published: bool = True,
        confirm: bool = False,
    ) -> str:
        """Create a new discussion topic in a course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            title: Discussion topic title.
            message: Discussion topic body content.
            delayed_post_at: ISO 8601 datetime to schedule posting.
            lock_at: ISO 8601 datetime to auto-lock the discussion.
            require_initial_post: Students must post before seeing other replies.
            pinned: Pin this discussion topic.
            published: Publish the topic immediately.
            confirm: Set true to actually create; without it, only a preview is returned.
        """
        if not title.strip():
            raise ToolError("title cannot be empty.")
        cid = await app.course_id(course)
        details = md.kv(
            [
                ("course", await app.course_name(cid)),
                ("title", title),
                ("message", message),
                ("delayed post at", delayed_post_at),
                ("lock at", lock_at),
                ("require initial post", require_initial_post),
                ("pinned", pinned),
                ("published", published),
            ]
        )
        if not confirm:
            return md.preview("create_discussion_topic", details)
        payload: dict[str, Any] = {
            "title": title,
            "message": message,
            "require_initial_post": require_initial_post,
            "pinned": pinned,
            "published": published,
        }
        if delayed_post_at:
            payload["delayed_post_at"] = delayed_post_at
        if lock_at:
            payload["lock_at"] = lock_at
        created = await app.client.post(f"/courses/{cid}/discussion_topics", json=payload)
        return md.done(
            "create_discussion_topic",
            md.kv([("id", created.get("id")), ("title", created.get("title")), ("url", created.get("html_url"))]),
        )

    @mcp.tool(annotations=WRITE)
    async def update_discussion_topic(
        course: str | int,
        topic_id: str | int,
        title: str | None = None,
        message: str | None = None,
        published: bool | None = None,
        pinned: bool | None = None,
        locked: bool | None = None,
        delayed_post_at: str | None = None,
        lock_at: str | None = None,
        require_initial_post: bool | None = None,
        confirm: bool = False,
    ) -> str:
        """Update fields on an existing discussion topic or announcement.

        Only the fields you pass are changed; omitted fields are left as-is.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            topic_id: Discussion topic id.
            title: New title.
            message: New body content (HTML supported).
            published: Publish or unpublish the topic.
            pinned: Pin or unpin the topic.
            locked: Lock or unlock the topic.
            delayed_post_at: ISO 8601 datetime to schedule posting.
            lock_at: ISO 8601 datetime to auto-lock the discussion.
            require_initial_post: Students must post before seeing other replies.
            confirm: Set true to actually update; without it, only a preview is returned.
        """
        fields: dict[str, Any] = {}
        for name, value in (
            ("title", title),
            ("message", message),
            ("published", published),
            ("pinned", pinned),
            ("locked", locked),
            ("delayed_post_at", delayed_post_at),
            ("lock_at", lock_at),
            ("require_initial_post", require_initial_post),
        ):
            if value is not None:
                fields[name] = value
        if not fields:
            raise ToolError("No fields to change. Pass at least one of title, message, published, pinned, locked, delayed_post_at, lock_at, require_initial_post.")

        cid = await app.course_id(course)
        topic = await app.client.get(f"/courses/{cid}/discussion_topics/{topic_id}")
        changes = []
        for key, new_value in fields.items():
            old_value = topic.get(key)
            changes.append((key, f"{md.cell(old_value)} -> {md.cell(new_value)}"))
        if not confirm:
            return md.preview("update_discussion_topic", md.kv(changes))
        updated = await app.client.put(f"/courses/{cid}/discussion_topics/{topic_id}", json=fields)
        return md.done("update_discussion_topic", md.kv([(k, v) for k, v in fields.items()] + [("title", updated.get("title"))]))

    @mcp.tool(annotations=READ)
    async def list_announcements(course: str | int | None = None, days: int = 30) -> str:
        """List announcements from one course or all active courses.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX". Omit to search all active courses.
            days: How many days back to search.
        """
        end = datetime.now(UTC)
        start = end - timedelta(days=days)
        params = {"start_date": start.isoformat(), "end_date": end.isoformat()}

        if course is not None:
            cid = await app.course_id(course)
            context_codes = [f"course_{cid}"]
            names = {cid: await app.course_name(cid)}
        else:
            courses = await app.courses.active()
            context_codes = [f"course_{c.get('id')}" for c in courses]
            names = {c.get("id"): c.get("name") or c.get("course_code") for c in courses}
            if not context_codes:
                return "_no active courses_"

        announcements = await app.client.get_all(
            "/announcements", {**params, "context_codes[]": context_codes}
        )
        announcements.sort(key=lambda a: a.get("posted_at") or "", reverse=True)

        def course_id_of(a: dict[str, Any]) -> int | None:
            code = a.get("context_code") or ""
            if code.startswith("course_"):
                try:
                    return int(code.removeprefix("course_"))
                except ValueError:
                    return None
            return None

        rows = [
            (
                names.get(course_id_of(a), md.NONE),
                a.get("id"),
                a.get("title"),
                md.fmt_date(a.get("posted_at")),
                app.person(a.get("author")),
                md.html_to_text(a.get("message"), 160),
            )
            for a in announcements
        ]
        table = md.table(["course", "id", "title", "posted", "author", "preview"], rows)
        if announcements.capped:
            table += f"\n\n{md.capped_notice(len(announcements))}"

        recent_blocks = []
        for a in announcements[:5]:
            recent_blocks.append(
                md.section(
                    f"{a.get('title')} ({names.get(course_id_of(a), md.NONE)}, {md.fmt_date(a.get('posted_at'))})",
                    md.html_to_text(a.get("message"), 1200) or "_no message_",
                    level=3,
                )
            )
        return md.join(table, md.section("Full text of the 5 most recent", md.join(*recent_blocks) or "_none_"))

    @mcp.tool(annotations=WRITE)
    async def create_announcement(
        course: str | int,
        title: str,
        message: str,
        delayed_post_at: str | None = None,
        confirm: bool = False,
    ) -> str:
        """Post a course announcement.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            title: Announcement title.
            message: Announcement content.
            delayed_post_at: ISO 8601 datetime to schedule posting.
            confirm: Set true to actually post; without it, only a preview is returned.
        """
        if not title.strip():
            raise ToolError("title cannot be empty.")
        cid = await app.course_id(course)

        permissions = await app.client.get(
            f"/courses/{cid}/permissions", {"permissions[]": ["create_announcement", "moderate_forum"]}
        )
        if not (permissions.get("create_announcement") or permissions.get("moderate_forum")):
            raise ToolError("Your Canvas role does not permit creating announcements in this course.")

        details = md.kv(
            [
                ("course", await app.course_name(cid)),
                ("title", title),
                ("message", message),
                ("delayed post at", delayed_post_at),
            ]
        )
        if not confirm:
            return md.preview("create_announcement", details)

        payload: dict[str, Any] = {"title": title, "message": message, "is_announcement": True}
        if delayed_post_at:
            payload["delayed_post_at"] = delayed_post_at
        created = await app.client.post(f"/courses/{cid}/discussion_topics", json=payload)

        if not created.get("is_announcement"):
            topic_id = created.get("id")
            if topic_id is not None:
                await app.client.delete(f"/courses/{cid}/discussion_topics/{topic_id}")
            raise ToolError("Canvas created a plain discussion topic instead of an announcement; it was deleted. Your role likely lacks announcement permission.")

        return md.done(
            "create_announcement",
            md.kv([("id", created.get("id")), ("title", created.get("title")), ("url", created.get("html_url"))]),
        )

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_announcement(
        course: str | int,
        announcement_id: str | int,
        require_title_match: str | None = None,
        confirm: bool = False,
    ) -> str:
        """Delete a single announcement.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            announcement_id: Announcement (discussion topic) id to delete.
            require_title_match: Only delete if the announcement's title equals this string exactly.
            confirm: Set true to actually delete; without it, only a preview is returned.
        """
        cid = await app.course_id(course)
        topic = await app.client.get(f"/courses/{cid}/discussion_topics/{announcement_id}")
        title = topic.get("title") or ""
        if require_title_match is not None and require_title_match != title:
            raise ToolError(f"require_title_match {require_title_match!r} does not equal the announcement's title {title!r}; refusing to delete.")
        details = md.kv([("title", title), ("posted", md.fmt_date(topic.get("posted_at")))])
        if not confirm:
            return md.preview("delete_announcement", details)
        await app.client.delete(f"/courses/{cid}/discussion_topics/{announcement_id}")
        return md.done("delete_announcement", md.kv([("id", announcement_id), ("title", title)]))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_announcements(
        course: str | int,
        announcement_ids: list[int],
        stop_on_error: bool = False,
        confirm: bool = False,
    ) -> str:
        """Delete multiple announcements by id.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            announcement_ids: Announcement ids to delete, up to 50.
            stop_on_error: Stop at the first failure instead of continuing with the rest.
            confirm: Set true to actually delete; without it, only a preview is returned.
        """
        if not announcement_ids:
            raise ToolError("announcement_ids cannot be empty.")
        if len(announcement_ids) > 50:
            raise ToolError(f"announcement_ids has {len(announcement_ids)} entries; cap is 50 per call.")
        cid = await app.course_id(course)

        titles: dict[int, str] = {}
        for aid in announcement_ids:
            try:
                topic = await app.client.get(f"/courses/{cid}/discussion_topics/{aid}")
                titles[aid] = topic.get("title") or "(untitled)"
            except CanvasError as exc:
                titles[aid] = f"[lookup failed: {exc.message}]"

        if not confirm:
            rows = [(aid, titles[aid]) for aid in announcement_ids]
            return md.preview("delete_announcements", md.table(["id", "title"], rows))

        results = []
        for aid in announcement_ids:
            try:
                await app.client.delete(f"/courses/{cid}/discussion_topics/{aid}")
                results.append((aid, titles.get(aid, ""), "deleted"))
            except CanvasError as exc:
                results.append((aid, titles.get(aid, ""), f"failed: {exc.message}"))
                if stop_on_error:
                    break
        return md.done("delete_announcements", md.table(["id", "title", "result"], results))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_announcements_matching(
        course: str | int,
        title_contains: str | None = None,
        posted_before: str | None = None,
        posted_after: str | None = None,
        limit: int = 20,
        confirm: bool = False,
    ) -> str:
        """Delete announcements matching title and/or date criteria.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            title_contains: Only match announcements whose title contains this text (case-insensitive).
            posted_before: ISO 8601 datetime; only match announcements posted before this.
            posted_after: ISO 8601 datetime; only match announcements posted after this.
            limit: Maximum number of matches to delete in one call.
            confirm: Set true to actually delete; without it, only a preview is returned.
        """
        if not any([title_contains, posted_before, posted_after]):
            raise ToolError("Provide at least one of title_contains, posted_before, posted_after.")
        cid = await app.course_id(course)
        announcements = await app.client.get_all(
            f"/courses/{cid}/discussion_topics", {"only_announcements": True}
        )

        needle = title_contains.casefold() if title_contains else None

        def matches(a: dict[str, Any]) -> bool:
            if needle is not None and needle not in (a.get("title") or "").casefold():
                return False
            posted = a.get("posted_at") or ""
            if posted_before is not None and not (posted and posted < posted_before):
                return False
            if posted_after is not None and not (posted and posted > posted_after):
                return False
            return True

        matched = [a for a in announcements if matches(a)][:limit]
        cap_notice = md.capped_notice(len(announcements)) if announcements.capped else ""
        if not matched:
            return md.join("_no announcements matched the given criteria_", cap_notice)

        if not confirm:
            rows = [(a.get("id"), a.get("title"), md.fmt_date(a.get("posted_at"))) for a in matched]
            return md.join(
                md.preview("delete_announcements_matching", md.table(["id", "title", "posted"], rows)),
                cap_notice,
            )

        results = []
        for a in matched:
            aid = a.get("id")
            try:
                await app.client.delete(f"/courses/{cid}/discussion_topics/{aid}")
                results.append((aid, a.get("title"), "deleted"))
            except CanvasError as exc:
                results.append((aid, a.get("title"), f"failed: {exc.message}"))
        return md.done("delete_announcements_matching", md.table(["id", "title", "result"], results))
