from __future__ import annotations

import difflib
import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from .. import md
from ..app import DESTRUCTIVE, READ, App

CONTENT_TYPES = {"pages", "assignments", "discussions", "syllabus"}
FIX_TYPES = {"alt_text", "heading_order", "link_text", "table_headers"}
GENERIC_LINK_TEXT = {"click here", "here", "read more", "more", "link", "this link"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}

FIX_GUIDANCE = {
    "img_no_alt": "Add a descriptive alt attribute to every informative <img>.",
    "img_empty_alt_informative": "The image conveys content; give it real alt text instead of alt=\"\".",
    "img_alt_filename": "Replace alt text that is just a filename with a description of the image.",
    "heading_skip": "Do not skip heading levels (e.g. h2 straight to h4); step down one level at a time.",
    "no_h1": "Give the page a single top-level h1 (or start its own heading structure at h2 if the page title already serves as h1).",
    "multiple_h1": "Use only one h1 per page; demote the rest to h2 or lower.",
    "table_no_th": "Mark header cells with <th> instead of styled <td>.",
    "table_no_caption": "Add a <caption> or accessible name describing the table's purpose.",
    "link_generic_text": "Replace vague link text (\"click here\", \"read more\") with text describing the destination.",
    "link_url_as_text": "Replace a raw URL used as link text with a short descriptive phrase.",
    "link_empty": "Give the link visible or aria-label text; empty links are unreadable by screen readers.",
    "link_duplicate_text": "Differentiate link text for links that point to different destinations.",
    "font_too_small": "Increase inline font-size below 12px to at least 12px (prefer relative units).",
    "low_contrast": "Increase the contrast between text color and background color to meet WCAG AA (4.5:1 for normal text).",
    "media_no_title": "Add a title attribute to <iframe>/<video> elements describing their content.",
    "media_no_captions": "Add a <track kind=\"captions\"> to videos for deaf/hard-of-hearing users.",
    "deprecated_tag": "Remove <blink>/<marquee>; they are deprecated and inaccessible.",
    "empty_heading": "Remove empty heading elements or give them text content.",
    "fake_list": "Use real <ul>/<ol>/<li> markup instead of <br> or dash-separated lines.",
    "bold_as_heading": "Use a real heading tag instead of an all-bold paragraph standing in for one.",
    "positive_tabindex": "Avoid positive tabindex values; they break natural tab order. Use 0 or remove it.",
    "autoplay_media": "Do not autoplay audio/video; let the user start playback.",
    "onclick_no_keyboard": "Non-interactive elements with onclick need a keyboard handler (onkeydown) and tabindex, or should be a <button>/<a>.",
}

CONTENT_TYPE_ENDPOINT = {
    "pages": "/courses/{cid}/pages",
    "assignments": "/courses/{cid}/assignments",
    "discussions": "/courses/{cid}/discussion_topics",
}


@dataclass
class Issue:
    check_id: str
    severity: str
    detail: str


@dataclass
class ContentItem:
    kind: str
    identifier: str
    title: str
    html: str


@dataclass
class Fix:
    kind: str
    detail: str


@dataclass
class FixResult:
    html: str
    fixes: list[Fix] = field(default_factory=list)


def _attr(attrs: list[tuple[str, str | None]], key: str) -> str | None:
    return dict(attrs).get(key)


def _style_props(style: str | None) -> dict[str, str]:
    if not style:
        return {}
    props = {}
    for part in style.split(";"):
        if ":" not in part:
            continue
        k, v = part.split(":", 1)
        props[k.strip().lower()] = v.strip()
    return props


def _relative_luminance(hexcolor: str) -> float | None:
    hexcolor = hexcolor.strip().lstrip("#")
    if len(hexcolor) == 3:
        hexcolor = "".join(c * 2 for c in hexcolor)
    if len(hexcolor) != 6:
        return None
    try:
        r, g, b = (int(hexcolor[i : i + 2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        return None

    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = channel(r), channel(g), channel(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast_ratio(fg_hex: str, bg_hex: str) -> float | None:
    fg = _relative_luminance(fg_hex)
    bg = _relative_luminance(bg_hex)
    if fg is None or bg is None:
        return None
    lighter, darker = max(fg, bg), min(fg, bg)
    return (lighter + 0.05) / (darker + 0.05)


def _looks_like_filename(alt: str) -> bool:
    return bool(re.match(r"^[\w\-]+\.(png|jpe?g|gif|svg|webp|bmp)$", alt.strip(), re.IGNORECASE))


class _AccessibilityScanner(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.issues: list[Issue] = []
        self._last_heading_level: int | None = None
        self._seen_h1 = False
        self._h1_count = 0
        self._link_texts: dict[str, set[str]] = {}
        self._current_href: str | None = None
        self._current_link_text: list[str] = []
        self._in_link = False
        self._current_table_has_th = False
        self._current_table_has_caption = False
        self._in_table = False
        self._current_p_tags: list[str] = []
        self._current_p_text: list[str] = []
        self._in_paragraph = False
        self._tag_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        self._tag_stack.append(tag)

        if tag == "img":
            alt = attrs_dict.get("alt")
            src = attrs_dict.get("src") or ""
            if alt is None:
                self.issues.append(Issue("img_no_alt", "high", f"<img src={src!r}> has no alt attribute."))
            elif alt.strip() == "":
                self.issues.append(
                    Issue("img_empty_alt_informative", "medium", f"<img src={src!r}> has empty alt (verify decorative).")
                )
            elif _looks_like_filename(alt):
                self.issues.append(Issue("img_alt_filename", "medium", f"<img> alt text {alt!r} looks like a filename."))

        elif tag in HEADING_TAGS:
            level = int(tag[1])
            if level == 1:
                self._h1_count += 1
                self._seen_h1 = True
            if self._last_heading_level is not None and level > self._last_heading_level + 1:
                self.issues.append(
                    Issue(
                        "heading_skip",
                        "medium",
                        f"<{tag}> follows h{self._last_heading_level}, skipping a level.",
                    )
                )
            self._last_heading_level = level

        elif tag == "table":
            self._in_table = True
            self._current_table_has_th = False
            self._current_table_has_caption = False

        elif tag == "th" and self._in_table:
            self._current_table_has_th = True

        elif tag == "caption" and self._in_table:
            self._current_table_has_caption = True

        elif tag == "a":
            self._in_link = True
            self._current_href = attrs_dict.get("href")
            self._current_link_text = []

        elif tag in ("iframe", "video"):
            if not attrs_dict.get("title"):
                self.issues.append(Issue("media_no_title", "medium", f"<{tag}> has no title attribute."))
            if tag == "video" and attrs_dict.get("autoplay") is not None:
                self.issues.append(Issue("autoplay_media", "medium", "<video> autoplays."))

        elif tag == "audio" and attrs_dict.get("autoplay") is not None:
            self.issues.append(Issue("autoplay_media", "medium", "<audio> autoplays."))

        elif tag in ("blink", "marquee"):
            self.issues.append(Issue("deprecated_tag", "low", f"<{tag}> is deprecated."))

        style_props = _style_props(attrs_dict.get("style"))
        if "font-size" in style_props:
            match = re.match(r"([\d.]+)px", style_props["font-size"])
            if match and float(match.group(1)) < 12:
                self.issues.append(Issue("font_too_small", "low", f"inline font-size {style_props['font-size']} is below 12px."))
        if "color" in style_props and "background-color" in style_props:
            fg = style_props["color"]
            bg = style_props["background-color"]
            if fg.startswith("#") and bg.startswith("#"):
                ratio = _contrast_ratio(fg, bg)
                if ratio is not None and ratio < 4.5:
                    self.issues.append(
                        Issue("low_contrast", "high", f"color {fg} on background {bg} has contrast ratio {ratio:.2f} (< 4.5).")
                    )

        tabindex = attrs_dict.get("tabindex")
        if tabindex is not None:
            try:
                if int(tabindex) > 0:
                    self.issues.append(Issue("positive_tabindex", "low", f"tabindex={tabindex} disrupts natural tab order."))
            except ValueError:
                pass

        if attrs_dict.get("onclick") is not None and tag not in ("a", "button", "input", "select", "textarea"):
            if attrs_dict.get("onkeydown") is None and attrs_dict.get("tabindex") is None:
                self.issues.append(Issue("onclick_no_keyboard", "medium", f"<{tag}> has onclick with no keyboard handler."))

        if tag == "p":
            self._in_paragraph = True
            self._current_p_tags = []
            self._current_p_text = []

        if self._in_paragraph and tag != "p":
            self._current_p_tags.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if self._tag_stack and self._tag_stack[-1] == tag:
            self._tag_stack.pop()

    def handle_data(self, data: str) -> None:
        if self._in_link:
            self._current_link_text.append(data)
        if self._in_paragraph:
            self._current_p_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._tag_stack and tag in self._tag_stack:
            self._tag_stack.pop()

        if tag in HEADING_TAGS:
            pass

        if tag == "table":
            self._in_table = False
            if not self._current_table_has_th:
                self.issues.append(Issue("table_no_th", "medium", "table has no <th> header cells."))
            if not self._current_table_has_caption:
                self.issues.append(Issue("table_no_caption", "low", "table has no <caption>."))

        elif tag == "a" and self._in_link:
            text = "".join(self._current_link_text).strip()
            href = self._current_href or ""
            if not text:
                self.issues.append(Issue("link_empty", "high", f"link to {href!r} has no text."))
            elif text.casefold() in GENERIC_LINK_TEXT:
                self.issues.append(Issue("link_generic_text", "medium", f"link text {text!r} is generic (href {href!r})."))
            elif re.match(r"^https?://", text):
                self.issues.append(Issue("link_url_as_text", "low", f"link text is a raw URL: {text!r}."))
            if text:
                targets = self._link_texts.setdefault(text.casefold(), set())
                targets.add(href)
                if len(targets) > 1:
                    self.issues.append(
                        Issue("link_duplicate_text", "medium", f"link text {text!r} points to multiple destinations.")
                    )
            self._in_link = False
            self._current_href = None
            self._current_link_text = []

        elif tag == "p" and self._in_paragraph:
            text = "".join(self._current_p_text).strip()
            tags = set(self._current_p_tags)
            if text and tags == {"strong"} and len(text) < 80:
                self.issues.append(Issue("bold_as_heading", "low", f"short bold-only paragraph may be a fake heading: {text!r}."))
            if text and len(text) < 200:
                lines = [ln for ln in text.split("\n") if ln.strip()]
                if len(lines) >= 3 and all(ln.strip().startswith(("-", "*")) for ln in lines):
                    self.issues.append(Issue("fake_list", "low", "paragraph looks like a dash-separated list, not real <ul>/<li>."))
            self._in_paragraph = False

        elif tag in HEADING_TAGS:
            pass

    def finalize(self) -> None:
        if not self._seen_h1:
            self.issues.append(Issue("no_h1", "medium", "content has no h1."))
        if self._h1_count > 1:
            self.issues.append(Issue("multiple_h1", "low", f"content has {self._h1_count} h1 elements."))


class _EmptyHeadingScanner(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.issues: list[Issue] = []
        self._in_heading: str | None = None
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in HEADING_TAGS:
            self._in_heading = tag
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._in_heading:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == self._in_heading:
            text = "".join(self._buffer).strip()
            if not text:
                self.issues.append(Issue("empty_heading", "low", f"<{tag}> is empty."))
            self._in_heading = None


def _run_checks(html: str) -> list[Issue]:
    scanner = _AccessibilityScanner()
    scanner.feed(html)
    scanner.close()
    scanner.finalize()
    empty = _EmptyHeadingScanner()
    empty.feed(html)
    empty.close()
    return scanner.issues + empty.issues


async def _fetch_items(app: App, cid: int, content_types: list[str]) -> tuple[list[ContentItem], list[str]]:
    items: list[ContentItem] = []
    capped: list[str] = []
    if "pages" in content_types:
        pages = await app.client.get_all(f"/courses/{cid}/pages")
        if pages.capped:
            capped.append(f"pages ({len(pages)})")
        bodies = await app.client.gather(
            [app.client.get(f"/courses/{cid}/pages/{p['url']}") for p in pages]
        )
        for full in bodies:
            items.append(ContentItem("page", full.get("url", ""), full.get("title") or full.get("url", ""), full.get("body") or ""))

    if "assignments" in content_types:
        assignments = await app.client.get_all(f"/courses/{cid}/assignments")
        if assignments.capped:
            capped.append(f"assignments ({len(assignments)})")
        for a in assignments:
            items.append(ContentItem("assignment", str(a.get("id")), a.get("name") or "", a.get("description") or ""))

    if "discussions" in content_types:
        topics = await app.client.get_all(f"/courses/{cid}/discussion_topics")
        if topics.capped:
            capped.append(f"discussions ({len(topics)})")
        for t in topics:
            items.append(ContentItem("discussion", str(t.get("id")), t.get("title") or "", t.get("message") or ""))

    if "syllabus" in content_types:
        course = await app.client.get(f"/courses/{cid}", {"include[]": ["syllabus_body"]})
        items.append(ContentItem("syllabus", "syllabus", "Syllabus", course.get("syllabus_body") or ""))

    return items, capped


def _capped_kinds_notice(capped: list[str]) -> str:
    if not capped:
        return ""
    return "_Capped at 1000 and more exist for: " + ", ".join(capped) + ". Narrow content_types or scan per-content to see the rest._"


def _parse_content_types(raw: str) -> list[str]:
    types = [t.strip() for t in raw.split(",") if t.strip()]
    if not types:
        raise ToolError("content_types must not be empty.")
    bad = [t for t in types if t not in CONTENT_TYPES]
    if bad:
        raise ToolError(f"Invalid content_types {bad}. Allowed: {sorted(CONTENT_TYPES)}.")
    return types


class _AltFixer(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.out: list[str] = []
        self.fixes: list[Fix] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._emit(tag, attrs, self_close=False)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._emit(tag, attrs, self_close=True)

    def _emit(self, tag: str, attrs: list[tuple[str, str | None]], self_close: bool) -> None:
        attrs = list(attrs)
        if tag == "img":
            alt = _attr(attrs, "alt")
            if alt is None or alt.strip() == "" or _looks_like_filename(alt):
                src = _attr(attrs, "src") or ""
                stem = re.split(r"[\\/]", src.split("?", 1)[0])[-1]
                stem = re.sub(r"\.(png|jpe?g|gif|svg|webp|bmp)$", "", stem, flags=re.IGNORECASE)
                words = re.sub(r"[_\-]+", " ", stem).strip() or "image"
                attrs = [(k, v) for k, v in attrs if k != "alt"]
                attrs.append(("alt", words))
                self.fixes.append(Fix("alt_text", f'set alt="{words}" on <img src={src!r}>'))
        rendered = " ".join(
            f'{k}="{v}"' if v is not None else k for k, v in attrs
        )
        self.out.append(f"<{tag} {rendered}{'/' if self_close else ''}>" if rendered else f"<{tag}{'/' if self_close else ''}>")

    def handle_endtag(self, tag: str) -> None:
        self.out.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        self.out.append(data)

    def handle_entityref(self, name: str) -> None:
        self.out.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.out.append(f"&#{name};")

    def handle_comment(self, data: str) -> None:
        self.out.append(f"<!--{data}-->")


def _fix_alt_text(html: str) -> FixResult:
    fixer = _AltFixer()
    fixer.feed(html)
    fixer.close()
    return FixResult("".join(fixer.out), fixer.fixes)


def _fix_heading_order(html: str) -> FixResult:
    fixes: list[Fix] = []
    last_level = 0
    seen_h1 = False

    def repl(match: re.Match) -> str:
        nonlocal last_level, seen_h1
        closing = match.group(1) == "/"
        tag = match.group(2).lower()
        rest = match.group(3) or ""
        level = int(tag[1])
        if not closing:
            if level == 1:
                seen_h1 = True
            new_level = level
            if last_level and level > last_level + 1:
                new_level = last_level + 1
                fixes.append(Fix("heading_order", f"demoted <h{level}> to <h{new_level}> to close a level gap"))
            last_level = new_level
            return f"<h{new_level}{rest}>"
        return f"</h{level}>"

    fixed_html = re.sub(r"<(/?)h([1-6])([^>]*)>", repl, html, flags=re.IGNORECASE)
    return FixResult(fixed_html, fixes)


def _fix_link_text(html: str, page_title: str) -> FixResult:
    fixes: list[Fix] = []

    def repl(match: re.Match) -> str:
        full_tag, attrs_str, inner = match.group(0), match.group(1), match.group(2)
        text = re.sub(r"<[^>]+>", "", inner).strip()
        if text.casefold() not in GENERIC_LINK_TEXT:
            return full_tag
        title_match = re.search(r'title="([^"]*)"', attrs_str)
        replacement = (title_match.group(1) if title_match else None) or page_title or "linked content"
        fixes.append(Fix("link_text", f"replaced link text {text!r} with {replacement!r}"))
        return f"<a{attrs_str}>{replacement}</a>"

    fixed_html = re.sub(r"<a([^>]*)>(.*?)</a>", repl, html, flags=re.IGNORECASE | re.DOTALL)
    return FixResult(fixed_html, fixes)


def _fix_table_headers(html: str) -> FixResult:
    fixes: list[Fix] = []

    def repl(match: re.Match) -> str:
        table_html = match.group(0)
        row_match = re.search(r"<tr[^>]*>(.*?)</tr>", table_html, re.IGNORECASE | re.DOTALL)
        if not row_match or "<th" in row_match.group(0).lower():
            return table_html
        first_row = row_match.group(0)

        def cell_repl(cell_match: re.Match) -> str:
            attrs_str, inner = cell_match.group(1), cell_match.group(2)
            new_attrs = attrs_str
            if "scope=" not in attrs_str.lower():
                new_attrs = f'{attrs_str} scope="col"'
            return f"<th{new_attrs}>{inner}</th>"

        new_first_row = re.sub(r"<td([^>]*)>(.*?)</td>", cell_repl, first_row, flags=re.IGNORECASE | re.DOTALL)
        if new_first_row != first_row:
            fixes.append(Fix("table_headers", "converted first row <td> cells to <th scope=\"col\">"))
        return table_html.replace(first_row, new_first_row, 1)

    fixed_html = re.sub(r"<table[^>]*>.*?</table>", repl, html, flags=re.IGNORECASE | re.DOTALL)
    return FixResult(fixed_html, fixes)


def _apply_fixes(html: str, fix_types: list[str], page_title: str) -> FixResult:
    fixes: list[Fix] = []
    current = html
    if "alt_text" in fix_types:
        result = _fix_alt_text(current)
        current, fixes = result.html, fixes + result.fixes
    if "heading_order" in fix_types:
        result = _fix_heading_order(current)
        current, fixes = result.html, fixes + result.fixes
    if "link_text" in fix_types:
        result = _fix_link_text(current, page_title)
        current, fixes = result.html, fixes + result.fixes
    if "table_headers" in fix_types:
        result = _fix_table_headers(current)
        current, fixes = result.html, fixes + result.fixes
    return FixResult(current, fixes)


def _diff_snippet(before: str, after: str, item_title: str) -> str:
    diff_lines = list(
        difflib.unified_diff(
            before.splitlines(), after.splitlines(), fromfile=f"{item_title} (before)", tofile=f"{item_title} (after)", lineterm=""
        )
    )
    snippet = "\n".join(diff_lines[:40])
    return f"```diff\n{snippet}\n```" if snippet else "_no textual diff_"


def _normalize_violation(raw: dict[str, Any]) -> dict[str, str]:
    return {
        "type": str(raw.get("type") or raw.get("check") or raw.get("rule") or "unknown"),
        "severity": str(raw.get("severity") or raw.get("level") or "unknown"),
        "location": str(raw.get("location") or raw.get("path") or raw.get("url") or raw.get("page") or "unknown"),
        "description": str(raw.get("description") or raw.get("message") or raw.get("detail") or ""),
        "recommendation": str(raw.get("recommendation") or raw.get("fix") or raw.get("suggestion") or ""),
    }


def _parse_violations_json(report_json: str) -> list[dict[str, str]]:
    try:
        parsed = json.loads(report_json)
    except json.JSONDecodeError as exc:
        raise ToolError(f"report_json is not valid JSON: {exc}") from exc

    if isinstance(parsed, dict):
        raw_list = parsed.get("violations")
        if raw_list is None:
            raise ToolError('JSON object must contain a "violations" list.')
    elif isinstance(parsed, list):
        raw_list = parsed
    else:
        raise ToolError("report_json must be a JSON list or an object with a violations list.")

    if not isinstance(raw_list, list):
        raise ToolError('"violations" must be a list.')

    return [_normalize_violation(v) for v in raw_list if isinstance(v, dict)]


def register(mcp: FastMCP, app: App) -> None:
    @mcp.tool(annotations=READ)
    async def scan_course_content_accessibility(
        course: str | int, content_types: str = "pages,assignments,discussions,syllabus"
    ) -> str:
        """Scan a course's content for common HTML accessibility issues.

        Checks images without alt text, heading order, tables without headers,
        vague or duplicate link text, low color contrast, missing media
        titles/captions, deprecated tags, tiny fonts, and a few other patterns.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            content_types: Comma-separated types to scan: pages, assignments, discussions, syllabus.
        """
        types = _parse_content_types(content_types)
        cid = await app.course_id(course)
        items, capped = await _fetch_items(app, cid, types)

        severity_counts = {"high": 0, "medium": 0, "low": 0}
        rows = []
        seen_checks: set[str] = set()
        for item in items:
            issues = _run_checks(item.html)
            for issue in issues:
                severity_counts[issue.severity] = severity_counts.get(issue.severity, 0) + 1
                seen_checks.add(issue.check_id)
                rows.append((item.title or item.identifier, item.kind, issue.check_id, issue.severity, issue.detail))

        summary = md.kv(
            [
                ("items scanned", len(items)),
                ("high severity", severity_counts.get("high", 0)),
                ("medium severity", severity_counts.get("medium", 0)),
                ("low severity", severity_counts.get("low", 0)),
                ("total issues", len(rows)),
            ]
        )
        table = md.table(["item", "type", "check", "severity", "detail"], rows)
        fixes = md.bullets(f"**{cid_}**: {FIX_GUIDANCE.get(cid_, 'review manually')}" for cid_ in sorted(seen_checks))
        return md.join(summary, md.section("Issues", table), md.section("How to fix", fixes), _capped_kinds_notice(capped))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def fix_accessibility_issues(
        course: str | int,
        fix_types: str = "alt_text,heading_order,link_text,table_headers",
        content_types: str = "pages",
        confirm: bool = False,
    ) -> str:
        """Apply safe automatic rewrites for a subset of accessibility issues.

        alt_text derives alt attributes from image filenames. heading_order
        closes single-level gaps by demoting headings. link_text replaces
        generic link text ("click here") with the link's title attribute or
        the page name. table_headers converts a table's first row to <th>
        cells with scope="col". This rewrites content; review the preview
        carefully before confirming.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            fix_types: Comma-separated fixes to apply: alt_text, heading_order, link_text, table_headers.
            content_types: Comma-separated types to fix: pages, assignments, discussions.
            confirm: Must be true to write the changes; otherwise returns a preview.
        """
        types_to_fix = [t.strip() for t in fix_types.split(",") if t.strip()]
        bad_fix_types = [t for t in types_to_fix if t not in FIX_TYPES]
        if bad_fix_types:
            raise ToolError(f"Invalid fix_types {bad_fix_types}. Allowed: {sorted(FIX_TYPES)}.")
        if not types_to_fix:
            raise ToolError("fix_types must not be empty.")

        types = _parse_content_types(content_types)
        if "syllabus" in types:
            raise ToolError("syllabus cannot be auto-fixed; edit it directly with a page/course tool.")

        cid = await app.course_id(course)
        items, capped = await _fetch_items(app, cid, types)

        planned = []
        for item in items:
            result = _apply_fixes(item.html, types_to_fix, item.title)
            if result.fixes:
                planned.append((item, result))

        if not confirm:
            if not planned:
                return md.preview("fix_accessibility_issues", md.join("No fixable issues found for the given fix_types/content_types.", _capped_kinds_notice(capped)))
            rows = [(item.title or item.identifier, item.kind, len(result.fixes)) for item, result in planned]
            details = [md.table(["item", "type", "edits"], rows)]
            for item, result in planned[:5]:
                details.append(
                    md.section(
                        f"{item.title or item.identifier} diff",
                        _diff_snippet(item.html, result.html, item.title or item.identifier),
                        level=3,
                    )
                )
            details.append(_capped_kinds_notice(capped))
            return md.preview("fix_accessibility_issues", md.join(*details))

        outcomes = []
        for item, result in planned:
            try:
                if item.kind == "page":
                    await app.client.put(f"/courses/{cid}/pages/{item.identifier}", json={"wiki_page": {"body": result.html}})
                elif item.kind == "assignment":
                    await app.client.put(
                        f"/courses/{cid}/assignments/{item.identifier}", json={"assignment": {"description": result.html}}
                    )
                elif item.kind == "discussion":
                    await app.client.put(
                        f"/courses/{cid}/discussion_topics/{item.identifier}", json={"message": result.html}
                    )
                outcomes.append((item.title or item.identifier, item.kind, "fixed", len(result.fixes)))
            except Exception as exc:  # noqa: BLE001
                outcomes.append((item.title or item.identifier, item.kind, "failed", str(exc)))

        if not outcomes:
            return md.done("fix_accessibility_issues", md.join("No fixable issues found for the given fix_types/content_types.", _capped_kinds_notice(capped)))
        return md.done("fix_accessibility_issues", md.join(md.table(["item", "type", "result", "detail"], outcomes), _capped_kinds_notice(capped)))

    @mcp.tool(annotations=READ)
    async def fetch_ufixit_report(course: str | int, page_title: str | None = None) -> str:
        """Find a course page whose title mentions "ufixit" and return its text plus any embedded JSON.

        Args:
            course: Course id, course code, part of the course name, or "sis_course_id:XXX".
            page_title: Exact or partial page title to look for instead of the default "ufixit" match.
        """
        cid = await app.course_id(course)
        pages = await app.client.get_all(f"/courses/{cid}/pages")
        needle = (page_title or "ufixit").casefold()
        match = next((p for p in pages if needle in (p.get("title") or "").casefold()), None)
        if match is None:
            hint = f" {md.capped_notice(len(pages))}" if pages.capped else ""
            raise ToolError(f"No page found with title containing {needle!r}.{hint}")

        full = await app.client.get(f"/courses/{cid}/pages/{match['url']}")
        body_html = full.get("body") or ""
        text = md.html_to_text(body_html)

        json_block = None
        script_match = re.search(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', body_html, re.DOTALL | re.IGNORECASE)
        if script_match:
            json_block = script_match.group(1).strip()
        else:
            brace_match = re.search(r"\{.*\}|\[.*\]", body_html, re.DOTALL)
            if brace_match:
                candidate = brace_match.group(0)
                try:
                    json.loads(candidate)
                    json_block = candidate
                except json.JSONDecodeError:
                    json_block = None

        blocks = [md.kv([("page", full.get("title")), ("url", full.get("url"))]), md.section("Report text", text or "_empty_")]
        if json_block:
            blocks.append(md.section("Embedded JSON", f"```json\n{json_block}\n```"))
        return md.join(*blocks)

    @mcp.tool(annotations=READ)
    async def parse_ufixit_violations(report_json: str) -> str:
        """Parse UFIXIT report JSON into a normalized violations table.

        Args:
            report_json: JSON text: either a list of violations, or an object with a "violations" list.
        """
        violations = _parse_violations_json(report_json)
        counts: dict[str, int] = {}
        rows = []
        for v in violations:
            counts[v["severity"]] = counts.get(v["severity"], 0) + 1
            rows.append((v["type"], v["severity"], v["location"], v["description"], v["recommendation"]))
        summary = md.kv([("total violations", len(violations)), *sorted(counts.items())])
        return md.join(summary, md.table(["type", "severity", "location", "description", "recommendation"], rows))

    @mcp.tool(annotations=READ)
    async def format_accessibility_summary(violations_json: str) -> str:
        """Format normalized violations into a summary grouped by severity and type, with top priorities.

        Args:
            violations_json: Same JSON shape as parse_ufixit_violations accepts.
        """
        violations = _parse_violations_json(violations_json)
        if not violations:
            return "_no violations_"

        by_severity: dict[str, list[dict[str, str]]] = {}
        for v in violations:
            by_severity.setdefault(v["severity"], []).append(v)

        severity_order = ["critical", "high", "serious", "medium", "moderate", "low", "minor", "unknown"]
        ordered_keys = sorted(by_severity, key=lambda s: severity_order.index(s) if s in severity_order else len(severity_order))

        blocks = []
        for severity in ordered_keys:
            group = by_severity[severity]
            by_type: dict[str, int] = {}
            for v in group:
                by_type[v["type"]] = by_type.get(v["type"], 0) + 1
            rows = sorted(by_type.items(), key=lambda kv: -kv[1])
            blocks.append(md.section(f"{severity} ({len(group)})", md.table(["type", "count"], rows), level=3))

        priority_rank = {s: i for i, s in enumerate(severity_order)}
        top5 = sorted(violations, key=lambda v: priority_rank.get(v["severity"], len(severity_order)))[:5]
        top_lines = [f"{v['type']} ({v['severity']}) at {v['location']}: {v['description']}" for v in top5]

        return md.join(
            md.kv([("total violations", len(violations))]),
            md.section("By severity", md.join(*blocks)),
            md.section("Top 5 priorities", md.bullets(top_lines)),
        )
