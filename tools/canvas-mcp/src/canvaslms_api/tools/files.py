from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any, Literal, get_args

import httpx
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import READ, WRITE, App

# Closed vocabularies are Literal so FastMCP emits a JSON Schema `enum`
# and a client can reject a bad value before the call. Prose in an `Args:`
# block cannot; the model would learn the set by eating a ToolError.
# Runtime checks are kept — a schema binds a well-behaved client only.
SortField = Literal["name", "size", "created_at", "updated_at", "content_type"]
Order = Literal["asc", "desc"]
OnDuplicate = Literal["rename", "overwrite"]

SORT_FIELDS = set(get_args(SortField))
ORDERS = set(get_args(Order))
ON_DUPLICATE = set(get_args(OnDuplicate))
TEXT_LIKE_PREFIXES = ("text/", "application/json", "application/xml")
TEXT_LIKE_TYPES = {"text/csv", "text/markdown", "application/csv"}
MAX_TEXT_CHARS = 20000
MAX_UPLOAD_BYTES = 100 * 1024 * 1024


def _human_size(size: Any) -> str:
    try:
        n = float(size)
    except (TypeError, ValueError):
        return md.NONE
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def _is_text_like(content_type: str | None) -> bool:
    if not content_type:
        return False
    lowered = content_type.lower()
    return lowered.startswith(TEXT_LIKE_PREFIXES) or lowered in TEXT_LIKE_TYPES


async def _folder_paths(app: App, cid: int) -> dict[Any, str]:
    folders = await app.client.get_all(f"/courses/{cid}/folders")
    return {f.get("id"): f.get("full_name") or f.get("name") or "" for f in folders}


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def list_files(
        course: str | int,
        search_term: str | None = None,
        sort: SortField = "name",
        order: Order = "asc",
    ) -> str:
        """List files in a Canvas course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            search_term: Filter files whose name contains this text.
            sort: Sort field: name, size, created_at, updated_at, or content_type.
            order: Sort order: asc or desc.
        """
        if sort not in SORT_FIELDS:
            raise ToolError(f"Invalid sort {sort!r}. Allowed: {', '.join(sorted(SORT_FIELDS))}.")
        if order not in ORDERS:
            raise ToolError(f"Invalid order {order!r}. Allowed: {', '.join(sorted(ORDERS))}.")
        cid = await app.course_id(course)
        params: dict[str, Any] = {"sort": sort, "order": order}
        if search_term:
            params["search_term"] = search_term
        files, folder_names = await app.client.gather(
            [
                app.client.get_all(f"/courses/{cid}/files", params),
                _folder_paths(app, cid),
            ]
        )
        rows = [
            (
                f.get("id"),
                f.get("display_name") or f.get("filename"),
                f.get("content-type"),
                _human_size(f.get("size")),
                md.fmt_date(f.get("updated_at")),
                f.get("locked_for_user"),
                folder_names.get(f.get("folder_id"), md.NONE),
            )
            for f in files
        ]
        table = md.table(["id", "name", "type", "size", "updated", "locked", "folder"], rows)
        if files.capped:
            table += f"\n\n{md.capped_notice(len(files))}"
        return table

    @mcp.tool(annotations=READ)
    async def read_file(course: str | int, file_id: str | int, max_size_mb: float = 5) -> str:
        """Read the text content of a small Canvas file directly.

        Text-like files (plain text, JSON, XML, CSV, Markdown) are decoded and
        returned inline, truncated at 20000 characters. PDFs, Office documents,
        and other binary formats are reported by type and size only; use
        download_file to fetch them.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            file_id: Canvas file id.
            max_size_mb: Refuse to read files larger than this, in megabytes.
        """
        cid = await app.course_id(course)
        info = await app.client.get(f"/courses/{cid}/files/{file_id}")
        size = info.get("size") or 0
        content_type = info.get("content-type")
        name = info.get("display_name") or info.get("filename") or str(file_id)
        limit_bytes = max_size_mb * 1024 * 1024
        if size > limit_bytes:
            raise ToolError(
                f"{name} is {_human_size(size)}, over the {max_size_mb} MB limit. "
                "Raise max_size_mb or use download_file."
            )
        if not _is_text_like(content_type):
            return md.kv(
                [
                    ("name", name),
                    ("type", content_type),
                    ("size", _human_size(size)),
                    ("note", "Binary content is not shown here. Use download_file to save it locally."),
                ]
            )
        response = await app.client.download(info["url"])
        text = response.content.decode("utf-8", errors="replace")
        body = md.truncate(text, MAX_TEXT_CHARS)
        # Anyone who can upload to the course wrote this file.
        return md.join(
            md.kv([("name", name), ("type", content_type), ("size", _human_size(size))]),
            md.section("Content", md.untrusted(body, f"file: {name}") if body else "_empty_"),
        )

    @mcp.tool(annotations=READ)
    async def download_file(
        course: str | int, file_id: str | int, save_directory: str | None = None
    ) -> str:
        """Download a Canvas file to the local filesystem.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            file_id: Canvas file id.
            save_directory: Local directory to save into. Defaults to the configured
                download directory, or the system temp directory.
        """
        cid = await app.course_id(course)
        info = await app.client.get(f"/courses/{cid}/files/{file_id}")
        name = info.get("display_name") or info.get("filename") or f"file_{file_id}"
        if os.path.basename(name) != name or ".." in Path(name).parts:
            raise ToolError(f"Refusing to save file with unsafe name {name!r}.")

        target_dir = Path(save_directory) if save_directory else app.settings.download_dir
        if target_dir is None:
            import tempfile

            target_dir = Path(tempfile.gettempdir())
        target_dir = target_dir.expanduser().resolve()
        if not target_dir.is_dir():
            raise ToolError(f"save_directory {target_dir} does not exist or is not a directory.")

        dest = target_dir / name
        if dest.resolve().parent != target_dir:
            raise ToolError(f"Refusing to save outside the target directory: {dest}.")
        stem, suffix = dest.stem, dest.suffix
        counter = 1
        while dest.exists():
            dest = target_dir / f"{stem} ({counter}){suffix}"
            counter += 1

        # Course files can run into the hundreds of MB; the shared 30s default is for API calls, not transfers.
        response = await app.client.download(info["url"], timeout=180.0)
        dest.write_bytes(response.content)
        return md.kv(
            [
                ("path", str(dest)),
                ("size", _human_size(len(response.content))),
                ("type", info.get("content-type")),
            ]
        )

    @mcp.tool(annotations=WRITE)
    async def upload_file(
        course: str | int,
        file_path: str,
        folder_path: str | None = None,
        display_name: str | None = None,
        on_duplicate: OnDuplicate = "rename",
        confirm: bool = False,
    ) -> str:
        """Upload a local file to a Canvas course.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            file_path: Absolute path to the local file to upload.
            folder_path: Destination folder path within the course, e.g. "unit1/handouts".
                Defaults to the course files root.
            display_name: Name to give the file in Canvas. Defaults to the local filename.
            on_duplicate: "rename" (default) or "overwrite" if a file with the same name exists.
            confirm: Must be true to actually upload.
        """
        if on_duplicate not in ON_DUPLICATE:
            raise ToolError(f"Invalid on_duplicate {on_duplicate!r}. Allowed: {', '.join(sorted(ON_DUPLICATE))}.")
        source = Path(file_path).expanduser()
        if not source.is_file():
            raise ToolError(f"No file at {source}.")
        size = source.stat().st_size
        if size > MAX_UPLOAD_BYTES:
            raise ToolError(f"{source.name} is {_human_size(size)}, over the 100 MB upload limit.")

        name = display_name or source.name
        cid = await app.course_id(course)
        details = md.kv(
            [
                ("course", await app.course_name(cid)),
                ("local path", str(source)),
                ("size", _human_size(size)),
                ("destination folder", folder_path or "(course files root)"),
                ("name", name),
                ("on duplicate", on_duplicate),
            ]
        )
        if not confirm:
            return md.preview("upload_file", details)

        payload: dict[str, Any] = {"name": name, "size": size, "on_duplicate": on_duplicate}
        if folder_path:
            payload["parent_folder_path"] = folder_path
        ticket = await app.client.post(f"/courses/{cid}/files", json=payload)
        upload_url = ticket.get("upload_url")
        upload_params = ticket.get("upload_params") or {}
        if not upload_url:
            raise ToolError("Canvas did not return an upload URL.")

        content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
        async with httpx.AsyncClient(follow_redirects=True, timeout=app.settings.timeout) as anonymous:
            with source.open("rb") as fh:
                response = await anonymous.post(
                    upload_url,
                    data=upload_params,
                    files={"file": (name, fh, content_type)},
                )
        if response.status_code >= 300:
            raise ToolError(f"Upload failed: Canvas returned {response.status_code}.")
        try:
            created = response.json() if response.content else {}
        except ValueError:
            created = {}
        return md.done(
            "upload_file",
            md.kv(
                [
                    ("id", created.get("id")),
                    ("name", created.get("display_name") or created.get("filename")),
                    ("size", _human_size(created.get("size"))),
                    ("url", created.get("url")),
                ]
            ),
        )
