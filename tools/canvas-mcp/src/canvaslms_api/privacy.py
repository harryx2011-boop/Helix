"""Student privacy: class-period labels, free-text scrubbing, local re-identification.

A student is shown to the model as ``P3-07`` (period 3, student 07), never by
name. The label is assigned once, at random, and persisted in a local
crosswalk; the crosswalk stores a keyed HMAC of the Canvas user id, never the
id or the name, so the file on its own identifies no one. Real identity is
joined back in only on this machine: label -> Canvas id when a tool argument
names a student, label -> name when text is written to Canvas, and in the
``canvaslms-api privacy roster`` terminal command.

Names are replaced by a dictionary built from each course's roster. That
catches the names Canvas knows, not nicknames, misspellings, or indirect
identifiers ("the kid whose mom coaches soccer"). It narrows what reaches the
model; it is not de-identification.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import tomllib
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .client import CanvasClient
    from .config import Settings

MODES = ("off", "pseudonymize", "strict")

LABEL_RE = re.compile(r"(?<![\w-])(?:P\d{1,2}|S)-\d{2,3}(?![\w-])")
GUARDIAN_PREFIX = "Guardian-"
PERSON_PREFIX = "Person-"
PSEUDONYM_RE = re.compile(rf"(?<![\w-])(?:{GUARDIAN_PREFIX}[0-9a-f]{{6}}|{PERSON_PREFIX}[0-9a-f]{{8}})(?![\w-])")

AMBIGUOUS = "[student]"
STAFF_COLLISION = "[name]"
EMAIL_TOKEN = "[email]"
PHONE_TOKEN = "[phone]"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Separators required: a bare 10-digit run is as likely to be a Canvas id.
PHONE_RE = re.compile(r"(?<!\w)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\w)")

PERIOD_RE = re.compile(
    r"(?i)(?<![a-z])(?:period|per\.?|pd\.?|hour|hr\.?|block|blk\.?)\s*#?\s*0?(\d{1,2})(?!\d)"
    r"|(?<![a-z0-9])p\s?0?(\d{1,2})(?![a-z0-9])"
)
NAME_PARTICLES = {"de", "da", "del", "der", "di", "du", "la", "le", "van", "von", "st", "jr", "sr", "ii", "iii", "iv"}

# Tool arguments that carry a Canvas user id. A label there resolves to the id;
# a label anywhere else is prose and resolves to the student's name.
ID_ARGS = {"user_id", "student_id", "reviewer_id", "reviewee_id", "recipient_ids", "recipients"}
ID_KEYED_ARGS = {"grades"}

STUDENT_TYPES = {"StudentEnrollment", "student"}
OBSERVER_TYPES = {"ObserverEnrollment", "observer"}
ENROLLMENT_STATES = ["active", "invited", "completed", "inactive"]


class PrivacyError(Exception):
    pass


def guess_period(section_name: str | None) -> int | None:
    """Read a class period out of a section name: "Period 3", "P3 - Bio", "Pd. 03"."""
    if not section_name:
        return None
    match = PERIOD_RE.search(section_name)
    if not match:
        return None
    return int(match.group(1) or match.group(2))


def _secure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    try:
        path.chmod(0o700)
    except OSError:
        pass
    return path


def _secure_file(path: Path) -> None:
    try:
        path.chmod(0o600)
    except OSError:
        pass


def format_label(period: int | None, number: int) -> str:
    width = 2 if number < 100 else 3
    prefix = f"P{period}" if period is not None else "S"
    return f"{prefix}-{number:0{width}d}"


class Crosswalk:
    """Persistent label assignments: (host, HMAC of user id) -> label."""

    def __init__(self, path: Path):
        self.path = path
        self._db: sqlite3.Connection | None = None

    def _conn(self) -> sqlite3.Connection:
        if self._db is None:
            _secure_dir(self.path.parent)
            self._db = sqlite3.connect(self.path)
            _secure_file(self.path)
            self._db.execute(
                "CREATE TABLE IF NOT EXISTS labels ("
                " host TEXT NOT NULL, user_key TEXT NOT NULL, period INTEGER,"
                " number INTEGER NOT NULL, label TEXT NOT NULL, assigned_at TEXT NOT NULL,"
                " PRIMARY KEY (host, user_key), UNIQUE (host, label))"
            )
            self._db.commit()
        return self._db

    def get(self, host: str, user_key: str) -> str | None:
        row = self._conn().execute(
            "SELECT label FROM labels WHERE host = ? AND user_key = ?", (host, user_key)
        ).fetchone()
        return row[0] if row else None

    def assign(self, host: str, user_key: str, period: int | None) -> str:
        existing = self.get(host, user_key)
        if existing:
            return existing
        conn = self._conn()
        # Numbers are drawn at random and never reused, so the order reveals
        # nothing about names and a student who drops leaves no gap to renumber.
        taken = {
            row[0]
            for row in conn.execute(
                "SELECT number FROM labels WHERE host = ? AND period IS ?", (host, period)
            )
        }
        ceiling = 99 if len(taken) < 90 else 999
        free = [n for n in range(1, ceiling + 1) if n not in taken]
        if not free:
            raise PrivacyError(f"No free student numbers left for period {period}.")
        for _ in range(20):
            number = free[secrets.randbelow(len(free))]
            label = format_label(period, number)
            try:
                conn.execute(
                    "INSERT INTO labels (host, user_key, period, number, label, assigned_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (host, user_key, period, number, label, datetime.now(UTC).isoformat()),
                )
                conn.commit()
                return label
            except sqlite3.IntegrityError:
                # Another process (the CLI next to Claude Desktop) got there first:
                # either this student now has a label, or that number was taken.
                conn.rollback()
                existing = self.get(host, user_key)
                if existing:
                    return existing
                free.remove(number)
                if not free:
                    break
        raise PrivacyError(f"Could not assign a label for period {period}; try again.")

    def count(self, host: str | None = None) -> int:
        if not self.path.exists():
            return 0
        if host is None:
            return self._conn().execute("SELECT COUNT(*) FROM labels").fetchone()[0]
        return self._conn().execute("SELECT COUNT(*) FROM labels WHERE host = ?", (host,)).fetchone()[0]

    def wipe(self) -> int:
        if not self.path.exists():
            return 0
        removed = self.count()
        self.close()
        self.path.unlink()
        return removed

    def close(self) -> None:
        if self._db is not None:
            self._db.close()
            self._db = None


@dataclass
class Member:
    user_id: int
    kind: str  # "student" | "observer" | "staff"
    label: str
    name: str
    courses: set[int] = field(default_factory=set)
    terms: set[str] = field(default_factory=set)  # matched case-insensitively
    parts: set[str] = field(default_factory=set)  # matched case-sensitively


@dataclass
class _Roster:
    loaded_at: float
    ok: bool
    error: str | None = None


def read_periods_file(path: Path) -> dict[str, int | None]:
    """Section id -> period overrides. ``"none"`` (or 0) means "no period"."""
    if not path.is_file():
        return {}
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    out: dict[str, int | None] = {}
    for key, value in (data.get("sections") or {}).items():
        if isinstance(value, int) and value > 0:
            out[str(key)] = value
        else:
            out[str(key)] = None
    return out


def write_periods_file(path: Path, mapping: dict[str, int | None]) -> None:
    _secure_dir(path.parent)
    lines = [
        "# Canvas section id -> class period, used for student labels (P<period>-<nn>).",
        '# "none" means the section has no period; its students are labelled S-<nn>.',
        "[sections]",
    ]
    for key in sorted(mapping, key=lambda k: (len(k), k)):
        value = mapping[key]
        lines.append(f'"{key}" = {value if value else chr(34) + "none" + chr(34)}')
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    _secure_file(path)


class Privacy:
    def __init__(self, settings: Settings, client: CanvasClient):
        self.settings = settings
        self.client = client
        self.mode = settings.privacy_mode
        self.dir = settings.privacy_path
        self.crosswalk = Crosswalk(self.dir / "crosswalk.db")
        self._key: bytes | None = None
        self._members: dict[int, Member] = {}
        self._by_label: dict[str, Member] = {}
        self._rosters: dict[int, _Roster] = {}
        self._locks: dict[int, asyncio.Lock] = {}
        self._self_id: int | None = None
        self._self_loaded = False
        self._patterns: tuple[re.Pattern[str] | None, dict[str, str], re.Pattern[str] | None, dict[str, str]] | None = None

    # -- mode -------------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return self.mode != "off"

    @property
    def strict(self) -> bool:
        return self.mode == "strict"

    # -- keyed ids ---------------------------------------------------------

    @property
    def key(self) -> bytes:
        if self._key is None:
            self._key = self._load_key()
        return self._key

    def _load_key(self) -> bytes:
        if self.settings.privacy_key:
            return self.settings.privacy_key.encode()
        path = self.dir / "privacy.key"
        if path.is_file():
            return path.read_text(encoding="utf-8").strip().encode()
        _secure_dir(self.dir)
        value = secrets.token_hex(32)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:  # another process created it first
            return path.read_text(encoding="utf-8").strip().encode()
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(value + "\n")
        return value.encode()

    def user_key(self, user_id: Any) -> str:
        message = f"{self.settings.host}:{user_id}".encode()
        return hmac.new(self.key, message, hashlib.sha256).hexdigest()

    def pseudonym(self, user_id: Any) -> str:
        """Keyed, non-reversible id for someone not on a loaded roster."""
        return f"{PERSON_PREFIX}{self.user_key(user_id)[:8]}"

    # -- rosters -----------------------------------------------------------

    async def _load_self(self) -> None:
        if self._self_loaded:
            return
        self._self_loaded = True
        try:
            me = await self.client.get("/users/self")
            self._self_id = me.get("id")
        except Exception:  # noqa: BLE001 - the token owner stays a pseudonym, which fails closed
            self._self_id = None

    async def prepare(self, course_id: int, force: bool = False) -> _Roster:
        """Load a course's roster into the label and scrub tables (cached for the cache TTL)."""
        cached = self._rosters.get(course_id)
        if cached and not force and time.monotonic() - cached.loaded_at < self.settings.cache_ttl:
            return cached
        lock = self._locks.setdefault(course_id, asyncio.Lock())
        async with lock:
            cached = self._rosters.get(course_id)
            if cached and not force and time.monotonic() - cached.loaded_at < self.settings.cache_ttl:
                return cached
            await self._load_self()
            try:
                users = await self.client.get_all(
                    f"/courses/{course_id}/users",
                    {"include[]": ["enrollments", "email"], "enrollment_state[]": ENROLLMENT_STATES},
                )
            except Exception as exc:  # noqa: BLE001 - recorded, and surfaced as a notice
                roster = _Roster(time.monotonic(), ok=False, error=str(exc))
                self._rosters[course_id] = roster
                return roster
            try:
                sections = await self.client.get_all(f"/courses/{course_id}/sections")
            except Exception:  # noqa: BLE001 - labels fall back to S-<nn>
                sections = []
            section_names = {s.get("id"): s.get("name") for s in sections}
            overrides = read_periods_file(self.dir / "periods.toml")
            for user in users:
                self._add_member(course_id, user, section_names, overrides)
            self._patterns = None
            roster = _Roster(time.monotonic(), ok=True)
            self._rosters[course_id] = roster
            return roster

    async def prepare_many(self, course_ids: Iterable[int]) -> None:
        ids = [cid for cid in course_ids if cid is not None]
        await asyncio.gather(*(self.prepare(cid) for cid in ids))

    def period_for(self, section_id: Any, section_name: str | None, overrides: dict[str, int | None]) -> int | None:
        key = str(section_id)
        if key in overrides:
            return overrides[key]
        return guess_period(section_name)

    def _add_member(
        self,
        course_id: int,
        user: dict[str, Any],
        section_names: dict[Any, str | None],
        overrides: dict[str, int | None],
    ) -> None:
        uid = user.get("id")
        if uid is None:
            return
        enrollments = [
            e for e in user.get("enrollments") or [] if e.get("course_id") in (None, course_id)
        ]
        types = {e.get("type") or e.get("role") for e in enrollments}
        if uid == self._self_id:
            kind = "staff"
        elif types & STUDENT_TYPES:
            kind = "student"
        elif types & OBSERVER_TYPES:
            kind = "observer"
        elif types:
            kind = "staff"
        else:
            # No enrollment detail: treat as a student, which fails closed.
            kind = "student"

        existing = self._members.get(uid)
        if existing and (existing.kind == "student" or kind == "staff"):
            # Student in any course wins over staff elsewhere: fail closed.
            member = existing
        else:
            if kind == "student":
                student_enrollment = next(
                    (e for e in enrollments if (e.get("type") or e.get("role")) in STUDENT_TYPES), None
                )
                section_id = student_enrollment.get("course_section_id") if student_enrollment else None
                period = self.period_for(section_id, section_names.get(section_id), overrides)
                label = self.crosswalk.assign(self.settings.host, self.user_key(uid), period)
            elif kind == "observer":
                label = f"{GUARDIAN_PREFIX}{self.user_key(uid)[:6]}"
            else:
                label = ""
            name = user.get("name") or user.get("short_name") or user.get("sortable_name") or ""
            member = Member(user_id=uid, kind=kind, label=label, name=name)
            self._members[uid] = member
            if label:
                self._by_label[label] = member

        member.courses.add(course_id)
        for value in (user.get("name"), user.get("short_name"), user.get("sortable_name")):
            if value and len(value.strip()) >= 2:
                member.terms.add(value.strip())
                if "," in value:  # "Chen, Maya" -> also "Maya Chen"
                    last, _, first = value.partition(",")
                    if first.strip() and last.strip():
                        member.terms.add(f"{first.strip()} {last.strip()}")
                for part in re.split(r"[\s,]+", value):
                    for piece in {part, *part.split("-")}:
                        piece = piece.strip(".'\"()")
                        if len(piece) >= 2 and piece.lower() not in NAME_PARTICLES:
                            member.parts.add(piece)
                            member.parts.add(piece[:1].upper() + piece[1:])
        for value in (user.get("login_id"), user.get("email"), user.get("sis_user_id")):
            if value and len(str(value).strip()) >= 3:
                member.terms.add(str(value).strip())

    def roster_notices(self, course_ids: Iterable[int] | None = None) -> list[str]:
        ids = self._rosters.keys() if course_ids is None else course_ids
        failed = [cid for cid in ids if (r := self._rosters.get(cid)) and not r.ok]
        if not failed:
            return []
        return [
            f"_Privacy: the roster for course {', '.join(map(str, failed))} could not be read "
            "with this token, so names inside free text there were not replaced. Author and "
            "participant names are still pseudonyms._"
        ]

    # -- people ------------------------------------------------------------

    def person(self, user: dict[str, Any] | None, fallback: str = "unknown") -> str:
        if not user:
            return fallback
        uid = user.get("id")
        if uid is None:
            return "[unknown person]"
        member = self._members.get(uid)
        if member is None:
            if uid == self._self_id:
                return user.get("name") or user.get("display_name") or fallback
            return self.pseudonym(uid)
        if member.kind == "staff":
            return member.name or user.get("display_name") or fallback
        return member.label

    def user_ref(self, user_id: Any) -> str:
        """How a raw user id is shown: a label in privacy modes, the id otherwise."""
        if user_id is None:
            return "unknown"
        try:
            uid = int(user_id)
        except (TypeError, ValueError):
            return str(user_id)
        member = self._members.get(uid)
        if member and member.kind != "staff":
            return member.label
        if member or uid == self._self_id or not self.strict:
            return str(uid)
        return self.pseudonym(uid)

    def label_for(self, user_id: Any) -> str | None:
        member = self._members.get(int(user_id)) if user_id is not None else None
        return member.label if member and member.label else None

    def member_for_label(self, label: str) -> Member | None:
        return self._by_label.get(label)

    def members(self, course_id: int | None = None) -> list[Member]:
        return [m for m in self._members.values() if course_id is None or course_id in m.courses]

    # -- outbound: scrub ---------------------------------------------------

    def _compile(self) -> tuple[re.Pattern[str] | None, dict[str, str], re.Pattern[str] | None, dict[str, str]]:
        if self._patterns is not None:
            return self._patterns
        full: dict[str, str] = {}  # casefolded term -> replacement
        parts: dict[str, set[str]] = {}  # part -> labels
        staff_parts: set[str] = set()
        for member in self._members.values():
            if member.kind == "staff":
                staff_parts |= member.parts
                continue
            for term in member.terms:
                key = term.casefold()
                full[key] = member.label if full.get(key, member.label) == member.label else AMBIGUOUS
            for part in member.parts:
                parts.setdefault(part, set()).add(member.label)
        # A one-word full term ("Maya" as a short name) is only as specific as the
        # name part it is: if another student or staff member shares it, it's ambiguous.
        for key, label in list(full.items()):
            if " " in key or "@" in key:
                continue
            owners = {lab for part, labs in parts.items() if part.casefold() == key for lab in labs}
            if owners - {label} or any(part.casefold() == key for part in staff_parts):
                full[key] = AMBIGUOUS
        part_map = {
            part: (next(iter(labels)) if len(labels) == 1 and part not in staff_parts else
                   STAFF_COLLISION if part in staff_parts and len(labels) == 1 else AMBIGUOUS)
            for part, labels in parts.items()
        }

        def build(terms: Iterable[str], flags: int) -> re.Pattern[str] | None:
            ordered = sorted(set(terms), key=len, reverse=True)
            if not ordered:
                return None
            body = "|".join(re.escape(t) for t in ordered)
            return re.compile(rf"(?<!\w)(?:{body})(?!\w)", flags)

        self._patterns = (build(full, re.IGNORECASE), full, build(part_map, 0), part_map)
        return self._patterns

    def scrub(self, text: str) -> str:
        if not self.enabled or not text:
            return text
        full_re, full, part_re, part_map = self._compile()
        if full_re is not None:
            text = full_re.sub(lambda m: full.get(m.group(0).casefold(), AMBIGUOUS), text)
        if part_re is not None:
            text = part_re.sub(lambda m: part_map[m.group(0)], text)
        if self.strict:
            text = EMAIL_RE.sub(EMAIL_TOKEN, text)
            text = PHONE_RE.sub(PHONE_TOKEN, text)
        return text

    def scrub_value(self, value: Any) -> Any:
        if isinstance(value, str):
            return self.scrub(value)
        if isinstance(value, list):
            return [self.scrub_value(v) for v in value]
        if isinstance(value, dict):
            return {k: self.scrub_value(v) for k, v in value.items()}
        return value

    def findings(self, text: str) -> list[tuple[int, str, str]]:
        """(line, matched text, replacement) for everything scrub() would change."""
        full_re, full, part_re, part_map = self._compile()
        found: list[tuple[int, str, str]] = []
        for lineno, line in enumerate(text.splitlines(), 1):
            spans: list[tuple[int, int]] = []
            for pattern, lookup in ((full_re, lambda s: full.get(s.casefold(), AMBIGUOUS)), (part_re, part_map.__getitem__)):
                if pattern is None:
                    continue
                for m in pattern.finditer(line):
                    if any(a <= m.start() < b for a, b in spans):
                        continue
                    spans.append((m.start(), m.end()))
                    found.append((lineno, m.group(0), lookup(m.group(0))))
            if self.strict:
                for pattern, token in ((EMAIL_RE, EMAIL_TOKEN), (PHONE_RE, PHONE_TOKEN)):
                    for m in pattern.finditer(line):
                        if not any(a <= m.start() < b for a, b in spans):
                            found.append((lineno, m.group(0), token))
        return found

    # -- inbound: resolve labels ------------------------------------------

    def _id_for(self, value: Any) -> Any:
        if isinstance(value, str) and LABEL_RE.fullmatch(value.strip()):
            member = self._by_label.get(value.strip())
            if member is None:
                raise PrivacyError(
                    f"Unknown student label {value.strip()!r}. Labels come from the course "
                    "roster; list the course's users to see the current ones."
                )
            return member.user_id
        if isinstance(value, str) and value.strip().startswith(GUARDIAN_PREFIX):
            member = self._by_label.get(value.strip())
            if member is None:
                raise PrivacyError(f"Unknown label {value.strip()!r}.")
            return member.user_id
        return value

    def _names_in(self, text: str, used: set[str]) -> str:
        def swap(m: re.Match[str]) -> str:
            member = self._by_label.get(m.group(0))
            if member is None or not member.name:
                return m.group(0)
            used.add(m.group(0))
            return member.name

        return LABEL_RE.sub(swap, text)

    def _prose(self, value: Any, used: set[str]) -> Any:
        if isinstance(value, str):
            return self._names_in(value, used)
        if isinstance(value, list):
            return [self._prose(v, used) for v in value]
        if isinstance(value, dict):
            return {k: self._prose(v, used) for k, v in value.items()}
        return value

    def restore_args(self, args: dict[str, Any]) -> tuple[dict[str, Any], set[str]]:
        """Resolve labels in tool arguments: to ids where an id is expected, to names in prose.

        Returns the new arguments and the labels that became real names.
        """
        used: set[str] = set()
        out: dict[str, Any] = {}
        for key, value in args.items():
            if key in ID_ARGS:
                if isinstance(value, list):
                    items = []
                    for item in value:
                        if isinstance(item, dict):
                            item = {
                                k: (self._id_for(v) if k == "user_id" else self._prose(v, used))
                                for k, v in item.items()
                            }
                        else:
                            resolved = self._id_for(item)
                            # send_conversation's recipients are strings (ids or aliases).
                            item = str(resolved) if key == "recipients" else resolved
                        items.append(item)
                    out[key] = items
                else:
                    resolved = self._id_for(value)
                    out[key] = resolved
            elif key in ID_KEYED_ARGS and isinstance(value, dict):
                out[key] = {str(self._id_for(k)): self._prose(v, used) for k, v in value.items()}
            else:
                out[key] = self._prose(value, used)
        return out, used

    # -- audit + retention -------------------------------------------------

    def audit(self, **event: Any) -> None:
        if not self.enabled:
            return
        try:
            _secure_dir(self.dir)
            path = self.dir / "audit.jsonl"
            event = {"ts": datetime.now(UTC).isoformat(timespec="seconds"), "mode": self.mode, **event}
            new = not path.exists()
            with path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, default=str) + "\n")
            if new:
                _secure_file(path)
        except OSError:
            pass

    def labels_in(self, text: str) -> list[str]:
        return sorted({m.group(0) for m in LABEL_RE.finditer(text) if m.group(0) in self._by_label})


def purge_downloads(settings: Settings, older_than_days: float | None = None) -> list[Path]:
    """Delete files older than the retention window from the managed download dir only."""
    if not settings.download_dir_managed or settings.download_dir is None:
        return []
    days = settings.retention_days if older_than_days is None else older_than_days
    root = settings.download_dir
    if not root.is_dir():
        return []
    cutoff = time.time() - days * 86400
    removed = []
    for path in root.rglob("*"):
        if path.is_file() and path.stat().st_mtime < cutoff:
            try:
                path.unlink()
                removed.append(path)
            except OSError:
                pass
    return removed


def ensure_download_dir(settings: Settings) -> None:
    if settings.download_dir_managed and settings.download_dir is not None:
        _secure_dir(settings.download_dir)
