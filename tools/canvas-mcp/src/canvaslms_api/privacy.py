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
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .client import CanvasClient
    from .config import Settings

MODES = ("off", "pseudonymize", "strict")

LABEL_RE = re.compile(r"(?<![\w-])(?:P\d{1,2}|S)-\d{2,4}(?![\w-])")
# In text bound for Canvas, only an explicitly marked label becomes a name:
# a bare "S-61" is as likely to be a room number as a student.
MARKER_RE = re.compile(r"\{\{\s*((?:P\d{1,2}|S)-\d{2,4}|Guardian-[0-9a-f]{6})\s*\}\}")
GUARDIAN_PREFIX = "Guardian-"
PERSON_PREFIX = "Person-"
PSEUDONYM_RE = re.compile(rf"(?<![\w-])(?:{GUARDIAN_PREFIX}[0-9a-f]{{6}}|{PERSON_PREFIX}[0-9a-f]{{8}})(?![\w-])")

AMBIGUOUS = "[student]"
STAFF_COLLISION = "[name]"
EMAIL_TOKEN = "[email]"
PHONE_TOKEN = "[phone]"

# The lookbehind anchors each attempt at the start of a run; without it a long
# run of word characters with no "@" costs quadratic time (36 s on 200 KB).
EMAIL_RE = re.compile(r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Separators required: a bare 10-digit run is as likely to be a Canvas id.
PHONE_RE = re.compile(r"(?<!\w)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\w)")

PERIOD_RE = re.compile(
    r"(?i)(?<![a-z])(?:period|per\.?|pd\.?|hour|hr\.?|block|blk\.?)\s*#?\s*0?(\d{1,2})(?!\d)"
    r"|(?<![a-z0-9])p\s?0?(\d{1,2})(?![a-z0-9])"
)
# Joiners that turn "Leo Park" into a slug, filename or URL form of the same name.
NAME_JOINERS = (" ", "-", "_", ".", "%20", "+", "")
NAME_PARTICLES = {"de", "da", "del", "der", "di", "du", "la", "le", "van", "von", "st", "jr", "sr", "ii", "iii", "iv"}

# Tool arguments that carry a Canvas user id. A label there resolves to the id;
# a label anywhere else is prose and resolves to the student's name.
ID_ARGS = {"user_id", "student_id", "reviewer_id", "reviewee_id", "recipient_ids", "recipients"}
ID_KEYED_ARGS = {"grades"}

STUDENT_TYPES = {"StudentEnrollment", "student"}
OBSERVER_TYPES = {"ObserverEnrollment", "observer"}
ENROLLMENT_STATES = ["active", "invited", "completed", "inactive"]
ROSTER_LIMIT = 10000


class PrivacyError(Exception):
    pass


def fold(text: str) -> str:
    """Strip accents: "José Núñez" -> "Jose Nunez"."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _with_folded(values: Iterable[str]) -> set[str]:
    out = set()
    for v in values:
        out.add(v)
        folded = fold(v)
        if folded != v:
            out.add(folded)
    return out


def guess_period(section_name: str | None) -> int | None:
    """Read a class period out of a section name: "Period 3", "P3 - Bio", "Pd. 03"."""
    if not section_name:
        return None
    match = PERIOD_RE.search(section_name)
    if not match:
        return None
    return int(match.group(1) or match.group(2))


def _trie_pattern(words: Iterable[str]) -> str:
    """Regex matching any of `words`, longest first, as a shared-prefix trie."""
    trie: dict = {}
    for word in words:
        node = trie
        for ch in word:
            node = node.setdefault(ch, {})
        node[""] = True

    def render(node: dict) -> str:
        end = "" in node
        branches = [re.escape(ch) + render(child) for ch, child in sorted(node.items()) if ch]
        if not branches:
            return ""
        body = branches[0] if len(branches) == 1 and not end else "(?:" + "|".join(branches) + ")"
        if end:
            return body + "?" if len(branches) == 1 and body.startswith("(?:") else f"(?:{'|'.join(branches)})?"
        return body

    return "(?:" + render(trie) + ")"


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
    width = 2 if number < 100 else 3 if number < 1000 else 4
    prefix = f"P{period}" if period is not None else "S"
    return f"{prefix}-{number:0{width}d}"


class Crosswalk:
    """Persistent label assignments: (host, HMAC of user id) -> label."""

    def __init__(self, path: Path):
        self.path = path
        self._db: sqlite3.Connection | None = None
        self._taken: dict[tuple[str, int | None], set[int]] = {}

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

    def commit(self) -> None:
        if self._db is not None:
            self._db.commit()

    def assign(self, host: str, user_key: str, period: int | None, commit: bool = True) -> str:
        existing = self.get(host, user_key)
        if existing:
            return existing
        conn = self._conn()
        # Numbers are drawn at random and never reused, so the order reveals
        # nothing about names and a student who drops leaves no gap to renumber.
        taken = self._taken_numbers(host, period)
        for _ in range(50):
            ceiling = 99 if len(taken) < 90 else 999 if len(taken) < 900 else 9999
            if len(taken) >= ceiling:
                raise PrivacyError(f"No free student numbers left for period {period}.")
            number = secrets.randbelow(ceiling) + 1
            if number in taken:
                continue
            label = format_label(period, number)
            try:
                conn.execute(
                    "INSERT INTO labels (host, user_key, period, number, label, assigned_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (host, user_key, period, number, label, datetime.now(UTC).isoformat()),
                )
                taken.add(number)
                if commit:
                    conn.commit()
                return label
            except sqlite3.IntegrityError:
                # Another process (the CLI next to Claude Desktop) got there first:
                # either this student now has a label, or that number was taken.
                # Commit what this batch has so far, then look again.
                conn.commit()
                existing = self.get(host, user_key)
                if existing:
                    return existing
                self._taken.pop((host, period), None)
                taken = self._taken_numbers(host, period)
        raise PrivacyError(f"Could not assign a label for period {period}; try again.")

    def _taken_numbers(self, host: str, period: int | None) -> set[int]:
        key = (host, period)
        if key not in self._taken:
            self._taken[key] = {
                row[0]
                for row in self._conn().execute(
                    "SELECT number FROM labels WHERE host = ? AND period IS ?", (host, period)
                )
            }
        return self._taken[key]

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
        self._taken.clear()
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
        if isinstance(value, int) and 0 < value <= 99:
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
            return self._read_key(path)
        _secure_dir(self.dir)
        value = secrets.token_hex(32)
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:  # another process created it first
            return self._read_key(path)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(value + "\n")
        return value.encode()

    @staticmethod
    def _read_key(path: Path) -> bytes:
        # Another process may have created the file and not written it yet. An
        # empty key would make every label a bare, reversible hash: never use one.
        for _ in range(50):
            value = path.read_text(encoding="utf-8").strip()
            if len(value) >= 16:
                return value.encode()
            time.sleep(0.02)
        raise PrivacyError(f"{path} is empty or too short; delete it to generate a new key.")

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

    def _fresh(self, roster: _Roster | None) -> bool:
        if roster is None:
            return False
        # A failed load is retried soon: it may have been a transient 429 or 5xx.
        ttl = self.settings.cache_ttl if roster.ok else min(30, self.settings.cache_ttl)
        return time.monotonic() - roster.loaded_at < ttl

    def roster_ok(self, course_id: int) -> bool:
        roster = self._rosters.get(course_id)
        return bool(roster and roster.ok)

    async def prepare(self, course_id: int, force: bool = False) -> _Roster:
        """Load a course's roster into the label and scrub tables (cached for the cache TTL)."""
        cached = self._rosters.get(course_id)
        if not force and self._fresh(cached):
            return cached
        lock = self._locks.setdefault(course_id, asyncio.Lock())
        async with lock:
            cached = self._rosters.get(course_id)
            if not force and self._fresh(cached):
                return cached
            await self._load_self()
            users, sections = await asyncio.gather(
                self.client.get_all(
                    f"/courses/{course_id}/users",
                    {"include[]": ["enrollments", "email"], "enrollment_state[]": ENROLLMENT_STATES},
                    limit=ROSTER_LIMIT,
                ),
                self.client.get_all(f"/courses/{course_id}/sections"),
                return_exceptions=True,
            )
            if isinstance(users, BaseException):
                roster = _Roster(time.monotonic(), ok=False, error=str(users))
                self._rosters[course_id] = roster
                return roster
            if isinstance(sections, BaseException):
                sections = []  # labels fall back to S-<nn>
            section_names = {s.get("id"): s.get("name") for s in sections}
            overrides = read_periods_file(self.dir / "periods.toml")
            before = self._signature()
            error = None
            try:
                for user in users:
                    self._add_member(course_id, user, section_names, overrides)
            except PrivacyError as exc:
                error = str(exc)
            finally:
                self.crosswalk.commit()
            if self._signature() != before:
                self._patterns = None
            if getattr(users, "capped", False):
                # Students past the cap would go out unscrubbed: say so.
                error = error or f"more than {ROSTER_LIMIT} people; only the first {ROSTER_LIMIT} were loaded"
            roster = _Roster(time.monotonic(), ok=error is None, error=error)
            self._rosters[course_id] = roster
            return roster

    async def prepare_many(self, course_ids: Iterable[int]) -> None:
        ids = [cid for cid in course_ids if cid is not None]
        await asyncio.gather(*(self.prepare(cid) for cid in ids))

    def _signature(self) -> tuple[int, int]:
        return (len(self._members), sum(len(m.terms) + len(m.parts) for m in self._members.values()))

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
                label = self.crosswalk.assign(self.settings.host, self.user_key(uid), period, commit=False)
            elif kind == "observer":
                label = f"{GUARDIAN_PREFIX}{self.user_key(uid)[:6]}"
            else:
                label = ""
            name = user.get("name") or user.get("short_name") or user.get("sortable_name") or ""
            member = Member(user_id=uid, kind=kind, label=label, name=name)
            if existing:  # staff elsewhere, student here: keep what was learned
                member.courses |= existing.courses
                member.terms |= existing.terms
                member.parts |= existing.parts
            self._members[uid] = member
            if label:
                self._by_label[label] = member

        member.courses.add(course_id)
        member.terms |= _with_folded(self._name_terms(user))
        member.parts |= _with_folded(self._name_parts(user))
        for value in (user.get("login_id"), user.get("email"), user.get("sis_user_id")):
            text = str(value or "").strip()
            # An all-digit SIS id would also match assignment numbers and scores.
            if len(text) >= 3 and not text.isdigit():
                member.terms.add(text)

    @staticmethod
    def _full_names(user: dict[str, Any]) -> list[list[str]]:
        """Each multi-word form of the user's name, as a list of words, "Last, First" flipped."""
        out = []
        for value in (user.get("name"), user.get("short_name"), user.get("sortable_name")):
            if not value:
                continue
            if "," in value:
                last, _, first = value.partition(",")
                value = f"{first} {last}"
            words = [w for w in re.split(r"\s+", value.strip()) if w]
            if len(words) >= 2:
                out.append(words)
        return out

    def _name_terms(self, user: dict[str, Any]) -> set[str]:
        """Multi-word names, matched case-insensitively, including slug and filename forms."""
        terms: set[str] = set()
        for words in self._full_names(user):
            for joiner in (" ", "-", "_", "%20", "+"):
                terms.add(joiner.join(words))
            first, last = words[0], words[-1]
            for joiner in NAME_JOINERS:
                for a, b in ((first, last), (last, first)):
                    joined = f"{a}{joiner}{b}"
                    if joiner or len(joined) >= 6:
                        terms.add(joined)
        return terms

    @staticmethod
    def _name_parts(user: dict[str, Any]) -> set[str]:
        """Single words of the name, matched case-sensitively so "will" and "Grace period" survive less often."""
        parts: set[str] = set()
        for value in (user.get("name"), user.get("short_name"), user.get("sortable_name")):
            for part in re.split(r"[\s,]+", value or ""):
                for piece in {part, *part.split("-")}:
                    piece = piece.strip(".'\"()")
                    if len(piece) >= 2 and piece.lower() not in NAME_PARTICLES:
                        parts.add(piece)
                        parts.add(piece[:1].upper() + piece[1:])
        return parts

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
        spellings: set[str] = set()  # the terms as written, for the pattern
        parts: dict[str, set[str]] = {}  # part -> labels
        staff_parts: set[str] = set()
        staff_terms: set[str] = set()
        for member in self._members.values():
            if member.kind == "staff":
                staff_parts |= member.parts
                staff_terms |= {t.casefold() for t in member.terms}
                continue
            for term in member.terms:
                key = term.casefold()
                spellings.add(term)
                full[key] = member.label if full.get(key, member.label) == member.label else AMBIGUOUS
            for part in member.parts:
                parts.setdefault(part, set()).add(member.label)
        folded_parts: dict[str, set[str]] = {}
        for part, labs in parts.items():
            folded_parts.setdefault(part.casefold(), set()).update(labs)
        folded_staff_parts = {p.casefold() for p in staff_parts}
        for key in full:
            # A student who shares a full name with a teacher can't be told apart.
            if key in staff_terms:
                full[key] = STAFF_COLLISION
            # A one-word term (a login id) is only as specific as the name part it equals.
            elif " " not in key and "@" not in key:
                owners = folded_parts.get(key, set())
                if owners - {full[key]} or key in folded_staff_parts:
                    full[key] = AMBIGUOUS
        part_map = {
            part: (next(iter(labels)) if len(labels) == 1 and part not in staff_parts else
                   STAFF_COLLISION if part in staff_parts and len(labels) == 1 else AMBIGUOUS)
            for part, labels in parts.items()
        }

        def build(terms: Iterable[str], boundary: str, flags: int) -> re.Pattern[str] | None:
            words = {t.lower() for t in terms} if flags & re.IGNORECASE else set(terms)
            if not words:
                return None
            # A shared-prefix trie, not a flat alternation: the flat form tries
            # every term at every position (3 s per 200 KB at 2,000 students).
            return re.compile(rf"(?<!{boundary}){_trie_pattern(words)}(?!{boundary})", flags)

        # Full terms end at anything but a letter or digit, so "Leo_Park_Essay"
        # and "maya.chen@x" match; name parts end at anything but a letter, so
        # "Maya2" and "Chen_notes" match too.
        self._patterns = (
            build(spellings, r"[^\W_]", re.IGNORECASE),
            full,
            build(part_map, r"[^\W\d_]", 0),
            part_map,
        )
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
        if isinstance(value, str) and (marked := MARKER_RE.fullmatch(value.strip())):
            value = marked.group(1)
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
            label = m.group(1)
            member = self._by_label.get(label)
            if member is None or not member.name:
                raise PrivacyError(f"Unknown label {{{{{label}}}}} in text; nothing was sent.")
            used.add(label)
            return member.name

        return MARKER_RE.sub(swap, text)

    def _prose(self, value: Any, used: set[str]) -> Any:
        if isinstance(value, str):
            return self._names_in(value, used)
        if isinstance(value, list):
            return [self._prose(v, used) for v in value]
        if isinstance(value, dict):
            return {k: self._prose(v, used) for k, v in value.items()}
        return value

    def restore_args(self, args: dict[str, Any]) -> tuple[dict[str, Any], set[str]]:
        """Resolve labels in tool arguments: bare or marked labels to ids where an id is
        expected, and marked labels ("{{P3-07}}") to real names in prose.

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
