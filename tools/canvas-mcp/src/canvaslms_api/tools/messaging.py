from __future__ import annotations

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
Scope = Literal["unread", "starred", "archived"]

SCOPES = set(get_args(Scope))
MAX_RECIPIENTS = 100
CONVERSATION_CAP = 50


def _alias_description(recipient: str, course_name: str) -> str | None:
    if recipient.endswith("_students"):
        return f"all students in {course_name}"
    if recipient.endswith("_teachers"):
        return f"all teachers in {course_name}"
    if recipient.endswith("_observers"):
        return f"all observers in {course_name}"
    if recipient.startswith("course_"):
        return f"everyone in {course_name}"
    if recipient.startswith("group_"):
        return f"members of group {recipient.removeprefix('group_')}"
    if recipient.startswith("section_"):
        return f"everyone in section {recipient.removeprefix('section_')}"
    return None


async def _resolve_recipient_label(app: App, cid: int, course_name: str, recipient: str) -> str:
    if recipient.isdigit():
        try:
            user = await app.client.get(f"/courses/{cid}/users/{recipient}")
            return app.person(user, fallback=f"user {recipient}")
        except CanvasError:
            return f"user {recipient}"
    alias = _alias_description(recipient, course_name)
    return alias or recipient


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_conversations(
        scope: Scope | None = None,
        course: str | int | None = None,
        include_participants: bool = True,
    ) -> str:
        """List your Canvas inbox conversations, newest first.

        Args:
            scope: Optional filter: unread, starred, or archived. Omit for all conversations.
            course: Optional course id, code, or name to restrict conversations to.
            include_participants: Include participant names in the table.
        """
        if scope is not None and scope not in SCOPES:
            raise ToolError(f"Invalid scope {scope!r}. Allowed: {', '.join(sorted(SCOPES))}.")
        params: dict[str, Any] = {}
        if scope:
            params["scope"] = scope
        if course is not None:
            cid = await app.course_id(course)
            params["filter[]"] = [f"course_{cid}"]
        # One over the cap, so a full inbox is distinguishable from an inbox of
        # exactly 50. Returning 50 silently either way makes a partial list read
        # as the whole thing — the failure every other truncation in this
        # codebase announces with `[truncated N characters]`.
        conversations = await app.client.get_all("/conversations", params, limit=CONVERSATION_CAP + 1)
        more = len(conversations) > CONVERSATION_CAP
        conversations = conversations[:CONVERSATION_CAP]
        conversations.sort(key=lambda c: c.get("last_message_at") or "", reverse=True)
        headers = ["id", "subject", "last message", "course", "unread", "messages"]
        if include_participants:
            headers.insert(3, "participants")
        rows = []
        for c in conversations:
            row = [
                c.get("id"),
                c.get("subject") or "(no subject)",
                md.fmt_date(c.get("last_message_at")),
            ]
            if include_participants:
                row.append(", ".join(app.person(p) for p in (c.get("participants") or [])))
            row.extend(
                [
                    c.get("context_name"),
                    c.get("workflow_state") == "unread",
                    c.get("message_count"),
                ]
            )
            rows.append(tuple(row))
        rendered = md.table(headers, rows)
        if more:
            rendered += (
                f"\n\n_Showing the {CONVERSATION_CAP} most recent conversations; there are more._"
            )
        return rendered

    @mcp.tool(annotations=READ)
    async def get_conversation(conversation_id: str | int, auto_mark_read: bool = False) -> str:
        """Get a full conversation thread with all its messages.

        Args:
            conversation_id: Canvas conversation id.
            auto_mark_read: Mark the conversation as read when viewing it.
        """
        convo = await app.client.get(
            f"/conversations/{conversation_id}", {"auto_mark_as_read": auto_mark_read}
        )
        participants = {p.get("id"): p for p in (convo.get("participants") or [])}
        header = md.kv(
            [
                ("subject", convo.get("subject") or "(no subject)"),
                ("course", convo.get("context_name")),
                ("participants", ", ".join(app.person(p) for p in participants.values())),
                ("message count", convo.get("message_count")),
            ]
        )
        blocks = [header]
        for message in convo.get("messages") or []:
            author = app.person(participants.get(message.get("author_id")))
            body = md.html_to_text(message.get("body"), 3000)
            attachments = message.get("attachments") or []
            attach_text = (
                "; ".join(f"{a.get('display_name') or a.get('filename')} ({a.get('url')})" for a in attachments)
                if attachments
                else None
            )
            # Author and date are ours. The body, and the filenames the sender
            # chose, are theirs — so the fence goes around those.
            inner = [body] if body else []
            if attach_text:
                inner.append(f"Attachments: {attach_text}")
            lines = [
                f"**{author}** ({md.fmt_date(message.get('created_at'))})",
                "",
                md.untrusted("\n\n".join(inner), "conversation message") if inner else "_empty_",
            ]
            blocks.append(md.section("", "\n".join(lines), level=3))
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def get_unread_count() -> str:
        """Get the number of unread conversations in your Canvas inbox."""
        result = await app.client.get("/conversations/unread_count")
        return f"Unread conversations: {result.get('unread_count', 0)}"

    @mcp.tool(annotations=WRITE)
    async def mark_conversations_read(conversation_ids: list[int], confirm: bool = False) -> str:
        """Mark one or more conversations as read.

        Args:
            conversation_ids: Conversation ids to mark as read.
            confirm: Must be true to actually mark them read.
        """
        if not conversation_ids:
            raise ToolError("conversation_ids cannot be empty.")
        subjects = []
        for cid in conversation_ids:
            try:
                convo = await app.client.get(f"/conversations/{cid}", {"auto_mark_as_read": False})
                subjects.append((cid, convo.get("subject") or "(no subject)"))
            except CanvasError as exc:
                subjects.append((cid, f"[lookup failed: {exc.message}]"))
        if not confirm:
            return md.preview("mark_conversations_read", md.table(["id", "subject"], subjects))
        await app.client.put(
            "/conversations", json={"conversation_ids[]": conversation_ids, "event": "mark_as_read"}
        )
        return md.done("mark_conversations_read", md.table(["id", "subject"], subjects))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def send_conversation(
        course: str | int,
        recipients: list[str],
        subject: str,
        body: str,
        confirm: bool = False,
    ) -> str:
        """Send a new Canvas inbox conversation to one or more recipients.

        Recipients may be numeric user ids or aliases like "course_123_students",
        "group_456", or "section_789". With multiple recipients each gets an
        individual copy of the message.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            recipients: List of recipient user ids or recipient aliases.
            subject: Message subject.
            body: Message content.
            confirm: Must be true to actually send.
        """
        if not recipients:
            raise ToolError("recipients cannot be empty.")
        if not body.strip():
            raise ToolError("body cannot be empty.")
        cid = await app.course_id(course)
        course_name = await app.course_name(cid)

        labels = [await _resolve_recipient_label(app, cid, course_name, r) for r in recipients]
        details = md.join(
            md.kv(
                [
                    ("course", course_name),
                    ("recipients", ", ".join(labels)),
                    ("subject", subject),
                ]
            ),
            md.section("Body", body),
        )
        if not confirm:
            return md.preview("send_conversation", details)

        payload: dict[str, Any] = {
            "recipients[]": recipients,
            "subject": subject,
            "body": body,
            "context_code": f"course_{cid}",
        }
        if len(recipients) > 1:
            payload["group_conversation"] = True
            payload["bulk_message"] = True
        created = await app.client.post("/conversations", json=payload)
        ids = [str(c.get("id")) for c in created] if isinstance(created, list) else [str(created.get("id"))]
        return md.done("send_conversation", md.kv([("conversation id(s)", ", ".join(ids))]))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def send_bulk_messages(
        course: str | int,
        recipients: list[dict[str, Any]],
        subject_template: str,
        body_template: str,
        confirm: bool = False,
    ) -> str:
        """Send individually templated Canvas inbox messages to many recipients.

        Each recipient dict must include "user_id" plus any variables referenced
        in the templates. Templates use Python str.format placeholders, e.g. "{name}".

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            recipients: List of dicts, each with "user_id" and template variables.
            subject_template: Subject template, e.g. "Reminder for {name}".
            body_template: Body template, e.g. "Hi {name}, you have {count} items due.".
            confirm: Must be true to actually send.
        """
        if not recipients:
            raise ToolError("recipients cannot be empty.")
        if len(recipients) > MAX_RECIPIENTS:
            raise ToolError(f"recipients has {len(recipients)} entries; cap is {MAX_RECIPIENTS} per call.")
        cid = await app.course_id(course)

        rendered: list[tuple[Any, str, str]] = []
        for entry in recipients:
            user_id = entry.get("user_id")
            if user_id is None:
                raise ToolError(f"Recipient {entry!r} is missing user_id.")
            try:
                subject = subject_template.format(**entry)
            except KeyError as exc:
                raise ToolError(f"Recipient {user_id}: subject_template needs {{{exc.args[0]}}}, not provided.") from exc
            try:
                body = body_template.format(**entry)
            except KeyError as exc:
                raise ToolError(f"Recipient {user_id}: body_template needs {{{exc.args[0]}}}, not provided.") from exc
            rendered.append((user_id, subject, body))

        if not confirm:
            blocks = []
            for user_id, subject, body in rendered[:3]:
                blocks.append(md.section(f"To user {user_id}", md.join(f"**Subject:** {subject}", body), level=3))
            remaining = rendered[3:]
            if remaining:
                blocks.append(
                    md.section(
                        "Remaining recipients",
                        md.table(["user id", "subject"], [(u, s) for u, s, _ in remaining]),
                        level=3,
                    )
                )
            return md.preview("send_bulk_messages", md.join(*blocks))

        results = await app.client.gather(
            [
                app.client.post(
                    "/conversations",
                    json={
                        "recipients[]": [str(user_id)],
                        "subject": subject,
                        "body": body,
                        "context_code": f"course_{cid}",
                    },
                )
                for user_id, subject, body in rendered
            ]
        )
        rows = []
        for (user_id, subject, _), result in zip(rendered, results, strict=True):
            if isinstance(result, Exception):
                rows.append((user_id, subject, f"failed: {result}"))
            else:
                convo_id = result[0].get("id") if isinstance(result, list) and result else None
                rows.append((user_id, subject, f"sent (conversation {convo_id})" if convo_id else "sent"))
        return md.done("send_bulk_messages", md.table(["user id", "subject", "result"], rows))
