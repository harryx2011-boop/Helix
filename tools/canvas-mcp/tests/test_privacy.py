from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import stat
import time
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
import respx
from fastmcp import Client

from canvaslms_api.app import App, build_app
from canvaslms_api.config import Settings
from canvaslms_api.privacy import (
    LABEL_RE,
    Crosswalk,
    PrivacyError,
    guess_period,
    purge_downloads,
    write_periods_file,
)
from canvaslms_api.server import build_server

BASE = "https://canvas.test/api/v1"
TEACHER = {"id": 1, "name": "Dana Okafor", "enrollments": [{"type": "TeacherEnrollment", "course_id": 10}]}
MAYA = {
    "id": 501,
    "name": "Maya Chen",
    "sortable_name": "Chen, Maya",
    "short_name": "Maya",
    "email": "maya.chen@kids.example",
    "login_id": "mchen27",
    "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 7}],
}
LEO = {
    "id": 502,
    "name": "Leo Park",
    "sortable_name": "Park, Leo",
    "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 8}],
}
MAYA_B = {
    "id": 503,
    "name": "Maya Rossi",
    "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 7}],
}
WILL = {
    "id": 504,
    "name": "Will Okafor",
    "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 99}],
}
PARENT = {"id": 601, "name": "Grace Chen", "enrollments": [{"type": "ObserverEnrollment", "course_id": 10}]}
ROSTER = [TEACHER, MAYA, LEO, MAYA_B, WILL, PARENT]
SECTIONS = [{"id": 7, "name": "Period 3 - Biology"}, {"id": 8, "name": "Bio Pd. 05"}, {"id": 99, "name": "Advisory"}]
STUDENT_SECRETS = ["Maya", "Chen", "Leo Park", "Rossi", "mchen27", "maya.chen@kids.example", "Grace"]


def make_settings(tmp_path: Path, mode: str = "strict", **kw) -> Settings:
    return Settings(
        base_url="https://canvas.test",
        token="t0ken",
        timeout=1.0,
        cache_ttl=60,
        max_concurrency=2,
        privacy_mode=mode,
        privacy_dir=tmp_path / "privacy",
        **kw,
    )


def mock_roster(router: respx.MockRouter) -> None:
    router.get(f"{BASE}/users/self").respond(json={"id": 1, "name": "Dana Okafor"})
    router.get(f"{BASE}/courses").respond(json=[{"id": 10, "name": "Biology", "course_code": "BIO"}])
    router.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Biology", "course_code": "BIO"})
    router.get(f"{BASE}/courses/10/users").respond(json=ROSTER)
    router.get(f"{BASE}/courses/10/sections").respond(json=SECTIONS)


@pytest.fixture
async def papp(tmp_path: Path) -> AsyncIterator[App]:
    app = build_app(make_settings(tmp_path))
    try:
        yield app
    finally:
        await app.aclose()


async def prepared(app: App, router: respx.MockRouter) -> App:
    mock_roster(router)
    await app.course_id(10)
    return app


# -- keyed ids -------------------------------------------------------------


async def test_pseudonym_is_keyed_not_a_bare_hash(tmp_path: Path) -> None:
    a = build_app(make_settings(tmp_path / "a"))
    b = build_app(make_settings(tmp_path / "b"))
    try:
        bare = hashlib.sha256(b"canvas.test:501").hexdigest()[:8]
        assert bare not in a.anonymous_id(501)
        # Different key, different pseudonym: nothing to precompute.
        assert a.anonymous_id(501) != b.anonymous_id(501)
        assert a.anonymous_id(501) == a.anonymous_id(501)
        key_file = tmp_path / "a" / "privacy" / "privacy.key"
        assert key_file.is_file()
        if os.name == "posix":
            assert stat.S_IMODE(key_file.stat().st_mode) == 0o600
    finally:
        await a.aclose()
        await b.aclose()


async def test_env_key_is_used_and_no_key_file_written(tmp_path: Path) -> None:
    app = build_app(make_settings(tmp_path, privacy_key="k" * 32))
    try:
        app.anonymous_id(1)
        assert not (tmp_path / "privacy" / "privacy.key").exists()
    finally:
        await app.aclose()


# -- periods and labels -------------------------------------------------------


@pytest.mark.parametrize(
    "name,period",
    [
        ("Period 3 - Biology", 3),
        ("P3 Bio", 3),
        ("Bio - P03", 3),
        ("Bio Pd. 05", 5),
        ("2nd Hour", None),
        ("Hour 2", 2),
        ("Block 4", 4),
        ("Advisory", None),
        ("SP2026-BIO-1234", None),
        ("Biology 101", None),
        (None, None),
    ],
)
def test_guess_period(name: str | None, period: int | None) -> None:
    assert guess_period(name) == period


def test_crosswalk_is_stable_unique_and_persistent(tmp_path: Path) -> None:
    path = tmp_path / "cw.db"
    cw = Crosswalk(path)
    labels = {f"k{i}": cw.assign("h", f"k{i}", 3) for i in range(40)}
    assert len(set(labels.values())) == 40
    assert all(re.fullmatch(r"P3-\d{2}", label) for label in labels.values())
    assert cw.assign("h", "k0", 7) == labels["k0"]  # a section change does not relabel
    cw.close()
    again = Crosswalk(path)
    assert again.get("h", "k5") == labels["k5"]
    assert again.assign("h", "nope", None).startswith("S-")
    again.close()


def test_crosswalk_numbers_are_not_in_insertion_order(tmp_path: Path) -> None:
    cw = Crosswalk(tmp_path / "cw.db")
    numbers = [int(cw.assign("h", f"k{i}", 1).split("-")[1]) for i in range(20)]
    cw.close()
    assert numbers != sorted(numbers)


def test_crosswalk_stores_no_ids_or_names(tmp_path: Path) -> None:
    import sqlite3

    cw = Crosswalk(tmp_path / "cw.db")
    cw.assign("canvas.test", "deadbeef" * 8, 3)
    cw.close()
    rows = sqlite3.connect(tmp_path / "cw.db").execute("SELECT * FROM labels").fetchall()
    assert len(rows) == 1 and "deadbeef" * 8 in rows[0]


async def test_labels_follow_sections(papp: App, mock: respx.MockRouter) -> None:
    await prepared(papp, mock)
    assert re.fullmatch(r"P3-\d{2}", papp.privacy.label_for(501))
    assert re.fullmatch(r"P5-\d{2}", papp.privacy.label_for(502))
    assert re.fullmatch(r"S-\d{2}", papp.privacy.label_for(504))
    assert papp.privacy.label_for(601).startswith("Guardian-")
    assert papp.privacy.label_for(1) is None


async def test_periods_override(tmp_path: Path, mock: respx.MockRouter) -> None:
    settings = make_settings(tmp_path)
    write_periods_file(settings.privacy_path / "periods.toml", {"99": 6, "8": None})
    app = build_app(settings)
    try:
        await prepared(app, mock)
        assert app.privacy.label_for(504).startswith("P6-")
        assert app.privacy.label_for(502).startswith("S-")
    finally:
        await app.aclose()


# -- people ------------------------------------------------------------------


async def test_person(papp: App, mock: respx.MockRouter) -> None:
    await prepared(papp, mock)
    assert LABEL_RE.fullmatch(papp.person({"id": 501, "display_name": "Maya Chen"}))
    assert papp.person({"id": 1, "display_name": "Dana Okafor"}) == "Dana Okafor"
    assert papp.person({"id": 999, "display_name": "Someone Else"}).startswith("Person-")
    assert papp.person({"display_name": "No Id"}) == "[unknown person]"
    assert papp.person(None, fallback="nobody") == "nobody"


async def test_user_ref_strict_vs_pseudonymize(tmp_path: Path, mock: respx.MockRouter) -> None:
    strict = build_app(make_settings(tmp_path / "s", "strict"))
    pseudo = build_app(make_settings(tmp_path / "p", "pseudonymize"))
    off = build_app(make_settings(tmp_path / "o", "off"))
    try:
        await prepared(strict, mock)
        await prepared(pseudo, mock)
        assert LABEL_RE.fullmatch(strict.user_ref(501))
        assert strict.user_ref(999).startswith("Person-")
        assert strict.user_ref(1) == "1"
        assert LABEL_RE.fullmatch(pseudo.user_ref(501))
        assert pseudo.user_ref(999) == "999"
        assert off.user_ref(501) == "501"
    finally:
        for app in (strict, pseudo, off):
            await app.aclose()


# -- scrub -------------------------------------------------------------------


async def test_scrub(papp: App, mock: respx.MockRouter) -> None:
    await prepared(papp, mock)
    p = papp.privacy
    maya, leo = p.label_for(501), p.label_for(502)
    out = p.scrub(
        "Maya Chen said Chen's idea was good; LEO PARK agreed. Chen, Maya again. "
        "Ask mchen27 or MAYA.CHEN@kids.example. Maya also posted. "
        "I will ask Will. Ms. Okafor graded it. Grace Chen called 555-201-3344 or other@x.org. "
        "Due 2026-09-22, id 1234567890."
    )
    # "Chen" is also the guardian's surname, so it can't be pinned to one person.
    assert f"{maya} said [student]'s idea" in out
    assert f"{leo} agreed" in out
    assert "Maya also" not in out and "[student] also" in out  # two Mayas: ambiguous
    assert "I will ask" in out  # lowercase word untouched
    assert "Ms. [name] graded" in out  # student surname = teacher's surname
    assert p.label_for(601) in out
    assert "[phone]" in out and "[email]" in out
    assert "2026-09-22" in out and "1234567890" in out
    for secret in STUDENT_SECRETS:
        assert secret not in out, secret


async def test_pseudonymize_leaves_unknown_emails_and_phones(tmp_path: Path, mock: respx.MockRouter) -> None:
    app = build_app(make_settings(tmp_path, "pseudonymize"))
    try:
        await prepared(app, mock)
        out = app.privacy.scrub("Maya Chen, other@x.org, 555-201-3344")
        assert "Maya" not in out and "other@x.org" in out and "555-201-3344" in out
    finally:
        await app.aclose()


# -- inbound -----------------------------------------------------------------


async def test_restore_args(papp: App, mock: respx.MockRouter) -> None:
    await prepared(papp, mock)
    p = papp.privacy
    maya, leo = p.label_for(501), p.label_for(502)
    args, named = p.restore_args(
        {
            "course": 10,
            "user_id": maya,
            "recipients": [maya, "course_10_students"],
            "recipient_ids": [leo, 77],
            "grades": {maya: {"grade": "A", "comment": f"Well done {{{{{maya}}}}}"}, "502": "B"},
            "body": f"Thanks {{{{{maya}}}}} and {{{{ {leo} }}}}; room S-61 and {maya} bare stay as written.",
        }
    )
    assert args["user_id"] == 501
    assert args["recipients"] == ["501", "course_10_students"]
    assert args["recipient_ids"] == [502, 77]
    assert args["grades"] == {"501": {"grade": "A", "comment": "Well done Maya Chen"}, "502": "B"}
    assert args["body"] == f"Thanks Maya Chen and Leo Park; room S-61 and {maya} bare stay as written."
    assert named == {maya, leo}

    bulk, _ = p.restore_args({"recipients": [{"user_id": f"{{{{{maya}}}}}", "name": f"{{{{{maya}}}}}"}]})
    assert bulk["recipients"] == [{"user_id": 501, "name": "Maya Chen"}]

    with pytest.raises(PrivacyError):
        p.restore_args({"user_id": "P9-99"})
    with pytest.raises(PrivacyError):
        p.restore_args({"body": "Hi {{P9-99}}"})


# -- through the server --------------------------------------------------------


def _text(result) -> str:  # noqa: ANN001
    return "\n".join(getattr(c, "text", "") for c in result.content)


async def test_end_to_end_labels_in_and_out(papp: App, mock: respx.MockRouter) -> None:
    mock_roster(mock)
    mock.get(f"{BASE}/courses/10/discussion_topics/5/entries").respond(
        json=[
            {
                "id": 9,
                "user": {"id": 502, "display_name": "Leo Park"},
                "message": "<p>I agree with Maya Chen. Reach me at 555-201-3344.</p>",
            }
        ]
    )
    mock.get(f"{BASE}/courses/10/users/501").respond(json=MAYA)
    sent = mock.post(f"{BASE}/conversations").respond(json=[{"id": 77}])
    server = build_server(app=papp)
    async with Client(server) as client:
        listed = await client.call_tool("list_discussion_entries", {"course": 10, "topic_id": 5})
        text = _text(listed)
        for secret in STUDENT_SECRETS + ["555-201-3344"]:
            assert secret not in text
            assert secret not in json.dumps(listed.structured_content)
        maya = papp.privacy.label_for(501)
        assert maya in text

        preview = await client.call_tool(
            "send_conversation",
            {"course": 10, "recipients": [maya], "subject": "Hi", "body": f"Great job {{{{{maya}}}}}!"},
        )
        assert "Maya" not in _text(preview) and maya in _text(preview)
        assert not sent.called

        await client.call_tool(
            "send_conversation",
            {"course": 10, "recipients": [maya], "subject": "Hi", "body": f"Great job {{{{{maya}}}}}!", "confirm": True},
        )
        payload = json.loads(sent.calls[0].request.content)
        assert payload["recipients[]"] == ["501"]
        assert payload["body"] == "Great job Maya Chen!"

    audit = (papp.settings.privacy_path / "audit.jsonl").read_text()
    for secret in STUDENT_SECRETS:
        assert secret not in audit
    assert '"tool": "send_conversation"' in audit


async def test_errors_are_scrubbed(papp: App, mock: respx.MockRouter) -> None:
    mock_roster(mock)
    mock.get(f"{BASE}/courses/10/assignments/5/submissions/501").respond(
        404, json={"errors": [{"message": "No submission for Maya Chen"}]}
    )
    server = build_server(app=papp)
    async with Client(server) as client:
        result = await client.call_tool(
            "get_rubric_assessment",
            {"course": 10, "assignment_id": 5, "user_id": "501"},
            raise_on_error=False,
        )
    assert result.is_error
    assert "Maya" not in _text(result)


async def test_unknown_label_is_refused(papp: App, mock: respx.MockRouter) -> None:
    mock_roster(mock)
    server = build_server(app=papp)
    async with Client(server) as client:
        result = await client.call_tool(
            "get_rubric_assessment",
            {"course": 10, "assignment_id": 5, "user_id": "P9-99"},
            raise_on_error=False,
        )
    assert result.is_error and "Unknown student label" in _text(result)


async def test_strict_refuses_a_course_whose_roster_failed(papp: App, mock: respx.MockRouter) -> None:
    mock.get(f"{BASE}/users/self").respond(json={"id": 1})
    mock.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Biology"})
    mock.get(f"{BASE}/courses/10/users").respond(403, json={"errors": [{"message": "unauthorized"}]})
    entries = mock.get(f"{BASE}/courses/10/discussion_topics/5/entries").respond(json=[])
    async with Client(build_server(app=papp)) as client:
        result = await client.call_tool(
            "list_discussion_entries", {"course": 10, "topic_id": 5}, raise_on_error=False
        )
    assert result.is_error and "Refused" in _text(result)
    assert not entries.called


async def test_roster_failure_is_announced(tmp_path: Path, mock: respx.MockRouter) -> None:
    papp = build_app(make_settings(tmp_path, "pseudonymize"))
    mock.get(f"{BASE}/users/self").respond(json={"id": 1})
    mock.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Biology"})
    mock.get(f"{BASE}/courses/10/users").respond(403, json={"errors": [{"message": "unauthorized"}]})
    mock.get(f"{BASE}/courses/10/discussion_topics/5/entries").respond(
        json=[{"id": 9, "user": {"id": 502, "display_name": "Leo Park"}, "message": "hi"}]
    )
    server = build_server(app=papp)
    async with Client(server) as client:
        result = await client.call_tool("list_discussion_entries", {"course": 10, "topic_id": 5})
    await papp.aclose()
    text = _text(result)
    assert "could not be read" in text
    assert "Leo Park" not in text and "Person-" in text


async def test_export_map_refused_over_mcp_allowed_on_cli(tmp_path: Path, mock: respx.MockRouter) -> None:
    mock_roster(mock)
    mcp_app = build_app(make_settings(tmp_path))
    async with Client(build_server(app=mcp_app)) as client:
        refused = await client.call_tool("export_anonymization_map", {"course": 10}, raise_on_error=False)
    await mcp_app.aclose()
    assert refused.is_error and "Refused" in _text(refused)

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    cli_app = build_app(make_settings(tmp_path), surface="cli")
    async with Client(build_server(app=cli_app)) as client:
        await client.call_tool(
            "export_anonymization_map", {"course": 10, "save_directory": str(out_dir), "confirm": True}
        )
    labels = {cli_app.privacy.label_for(501), cli_app.privacy.label_for(502)}
    await cli_app.aclose()
    (path,) = out_dir.iterdir()
    rows = list(csv.DictReader(path.open()))
    assert {r["label"] for r in rows} >= labels
    if os.name == "posix":
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


async def test_privacy_off_is_unchanged(tmp_path: Path, mock: respx.MockRouter) -> None:
    app = build_app(make_settings(tmp_path, "off"))
    mock.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Biology"})
    mock.get(f"{BASE}/courses/10/users").respond(json=[MAYA])
    async with Client(build_server(app=app)) as client:
        result = await client.call_tool("list_users", {"course": 10})
    await app.aclose()
    assert "Maya Chen" in _text(result) and "501" in _text(result)
    assert not (tmp_path / "privacy" / "audit.jsonl").exists()


# -- retention -----------------------------------------------------------------


def test_purge_only_touches_managed_dir(tmp_path: Path) -> None:
    downloads = tmp_path / "dl"
    downloads.mkdir()
    old, new = downloads / "old.pdf", downloads / "new.pdf"
    old.write_text("x")
    new.write_text("y")
    past = time.time() - 40 * 86400
    os.utime(old, (past, past))

    unmanaged = make_settings(tmp_path, download_dir=downloads, download_dir_managed=False)
    assert purge_downloads(unmanaged) == []
    assert old.exists()

    managed = make_settings(tmp_path, download_dir=downloads, download_dir_managed=True)
    assert purge_downloads(managed) == [old]
    assert not old.exists() and new.exists()


# -- the sweep: no read tool leaks a roster identity in strict mode -------------


def _poisoned(path: str) -> object:
    person = {"id": 501, "name": "Maya Chen", "display_name": "Maya Chen", "short_name": "Maya", "sortable_name": "Chen, Maya"}
    item = {
        "id": 9001,
        "user_id": 501,
        "assessor_id": 501,
        "author_id": 501,
        "asset_id": 9001,
        "name": "Unit 1",
        "title": "Unit 1",
        "display_name": "Maya Chen",
        "message": "<p>Maya Chen wrote this. Email maya.chen@kids.example, login mchen27.</p>",
        "body": "<p>From Maya Chen (mchen27)</p>",
        "comment": "Chen, Maya says hi",
        "description": "<p>Maya's work</p>",
        "workflow_state": "completed",
        "user": person,
        "author": person,
        "assessor": person,
        "last_edited_by": person,
        "participants": [person, {"id": 1, "name": "Dana Okafor"}],
        "messages": [{"author_id": 501, "body": "Maya Chen here", "created_at": "2026-09-01T00:00:00Z"}],
        "submission_comments": [{"author": person, "author_id": 501, "comment": "Maya Chen asked"}],
        "recent_replies": [{"user": person, "message": "Maya Chen reply"}],
        "rubric_assessment": {"c1": {"points": 1, "comments": "Maya Chen"}},
        "users": [person],
        "enrollments": [{"type": "StudentEnrollment", "user": person, "grades": {}}],
        "view": [],
        "html_url": "https://canvas.test/x",
    }
    last = path.rstrip("/").rsplit("/", 1)[-1]
    if last.isdigit() or last in {"view", "profile", "self", "syllabus", "front_page", "unread_count"}:
        return item
    return [item]


READ_ARG_DEFAULTS = {
    "course": 10,
    "user_id": "501",
    "student_id": "501",
    "search_term": "x",
    "query": "x",
    "login_id": "mchen27",
    "keyword": "x",
}


async def test_sweep_read_tools_leak_nothing(papp: App, mock: respx.MockRouter) -> None:
    mock_roster(mock)

    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_poisoned(request.url.path))

    mock.get(url__regex=r".*").mock(side_effect=respond)
    server = build_server(app=papp)
    tools = [t for t in await server.list_tools() if t.annotations and t.annotations.readOnlyHint]
    assert len(tools) > 40
    leaks: dict[str, list[str]] = {}
    async with Client(server) as client:
        for tool in tools:
            schema = tool.parameters or {}
            args = {}
            for name in schema.get("required", []):
                prop = schema["properties"][name]
                if name in READ_ARG_DEFAULTS:
                    args[name] = READ_ARG_DEFAULTS[name]
                elif name.endswith("_id") or name.endswith("_url"):
                    args[name] = "https://canvas.test/x" if name.endswith("_url") else 5
                elif prop.get("type") == "array":
                    args[name] = []
                else:
                    args[name] = "x"
            result = await client.call_tool(tool.name, args, raise_on_error=False)
            blob = _text(result) + json.dumps(result.structured_content or {})
            found = [s for s in STUDENT_SECRETS if s in blob]
            if re.search(r"(?<!\d)501(?!\d)", blob):
                found.append("raw id 501")
            if found:
                leaks[tool.name] = found
    assert not leaks, leaks


def test_crosswalk_survives_a_concurrent_writer(tmp_path: Path) -> None:
    path = tmp_path / "cw.db"
    first, second = Crosswalk(path), Crosswalk(path)
    label = first.assign("h", "same-student", 3)
    # A second process that hasn't seen that row yet still ends up with the same label.
    assert second.assign("h", "same-student", 3) == label
    others = {second.assign("h", f"s{i}", 3) for i in range(30)}
    assert label not in others and len(others) == 30
    first.close()
    second.close()


# -- audit regressions (2026-09-22) ----------------------------------------------

JOSE = {
    "id": 505,
    "name": "José Núñez",
    "sis_user_id": "204518",
    "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 7}],
}
AL = {"id": 506, "name": "Al Brandt", "short_name": "Al", "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 7}]}
CHRIS_STUDENT = {"id": 507, "name": "Chris Lee", "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 7}]}
CHRIS_TA = {"id": 2, "name": "Chris Lee", "enrollments": [{"type": "TaEnrollment", "course_id": 10}]}


async def _prepared_with(app: App, mock: respx.MockRouter, *extra: dict) -> App:
    mock.get(f"{BASE}/users/self").respond(json={"id": 1, "name": "Dana Okafor"})
    mock.get(f"{BASE}/courses").respond(json=[{"id": 10, "name": "Biology"}])
    mock.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Biology"})
    mock.get(f"{BASE}/courses/10/users").respond(json=[*ROSTER, *extra])
    mock.get(f"{BASE}/courses/10/sections").respond(json=SECTIONS)
    await app.course_id(10)
    return app


async def test_scrub_catches_slugs_filenames_and_folded_accents(papp: App, mock: respx.MockRouter) -> None:
    await _prepared_with(papp, mock, JOSE)
    p = papp.privacy
    leo, jose = p.label_for(502), p.label_for(505)
    out = p.scrub(
        "Leo_Park_Essay.docx LeoPark.pdf /pages/spotlight-leo-park Maya%20Chen "
        "Jose Nunez and José Núñez; Núñez_final.pdf"
    )
    assert out.count(leo) == 3, out
    assert out.count(jose) == 3, out
    for secret in ["Leo", "Park", "Maya", "Chen", "Jose", "José", "Nunez", "Núñez"]:
        assert secret not in out, (secret, out)


async def test_one_word_names_and_numeric_ids_do_not_eat_ordinary_text(papp: App, mock: respx.MockRouter) -> None:
    await _prepared_with(papp, mock, JOSE, AL)
    out = papp.privacy.scrub("The quiz will be due. Smith et al. Assignment 204518 is out. Al passed.")
    assert "quiz will be" in out and "et al." in out and "Assignment 204518" in out
    assert "Al passed" not in out


async def test_student_sharing_a_staff_full_name_is_not_resolvable(papp: App, mock: respx.MockRouter) -> None:
    await _prepared_with(papp, mock, CHRIS_STUDENT, CHRIS_TA)
    out = papp.privacy.scrub("Comment by Chris Lee (TA)")
    assert "Chris Lee" not in out and papp.privacy.label_for(507) not in out


async def test_validation_errors_do_not_echo_resolved_names(papp: App, mock: respx.MockRouter) -> None:
    await prepared(papp, mock)
    maya = papp.privacy.label_for(501)
    async with Client(build_server(app=papp)) as client:
        result = await client.call_tool(
            "get_page", {"course": 10, "page": "x", "max_chars": f"{{{{{maya}}}}} x"}, raise_on_error=False
        )
    assert result.is_error and "Maya" not in _text(result)
    assert '"outcome": "error"' in (papp.settings.privacy_path / "audit.jsonl").read_text()


async def test_bulk_template_user_id_renders_as_label(papp: App, mock: respx.MockRouter) -> None:
    await prepared(papp, mock)
    maya = papp.privacy.label_for(501)
    async with Client(build_server(app=papp)) as client:
        result = await client.call_tool(
            "send_bulk_messages",
            {"course": 10, "recipients": [{"user_id": maya}], "subject_template": "Hi", "body_template": "id {user_id}"},
        )
    text = _text(result)
    assert f"id {maya}" in text and "501" not in text


def test_email_regex_is_linear_on_long_runs() -> None:
    from canvaslms_api.privacy import EMAIL_RE

    start = time.perf_counter()
    EMAIL_RE.sub("[email]", "a" * 200_000)
    assert time.perf_counter() - start < 1.0


def test_labels_grow_to_four_digits(tmp_path: Path) -> None:
    cw = Crosswalk(tmp_path / "cw.db")
    labels = [cw.assign("h", f"k{i}", None, commit=False) for i in range(1200)]
    cw.commit()
    cw.close()
    assert len(set(labels)) == 1200
    assert all(LABEL_RE.fullmatch(label) for label in labels)


async def test_capped_roster_is_reported_not_trusted(papp: App, mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("canvaslms_api.privacy.ROSTER_LIMIT", 2)
    mock.get(f"{BASE}/users/self").respond(json={"id": 1})
    mock.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Biology"})
    mock.get(f"{BASE}/courses/10/sections").respond(json=SECTIONS)
    mock.get(f"{BASE}/courses/10/users").respond(
        json=ROSTER, headers={"Link": f'<{BASE}/courses/10/users?page=2>; rel="next"'}
    )
    await papp.course_id(10)
    assert not papp.privacy.roster_ok(10)
    assert papp.privacy.roster_notices([10])


async def test_scrub_scales_with_a_large_roster(tmp_path: Path, mock: respx.MockRouter) -> None:
    app = build_app(make_settings(tmp_path))
    first = ["Ava", "Liam", "Noah", "Emma", "Mia", "Zoe", "Ethan", "Ivy", "Owen", "Ruby"]
    users = [
        {
            "id": 1000 + i,
            "name": f"{first[i % 10]}{i} Surname{i}",
            "enrollments": [{"type": "StudentEnrollment", "course_id": 10, "course_section_id": 7}],
        }
        for i in range(2000)
    ]
    mock.get(f"{BASE}/users/self").respond(json={"id": 1})
    mock.get(f"{BASE}/courses/10").respond(json={"id": 10, "name": "Big"})
    mock.get(f"{BASE}/courses/10/users").respond(json=users)
    mock.get(f"{BASE}/courses/10/sections").respond(json=SECTIONS)
    try:
        start = time.perf_counter()
        await app.course_id(10)
        app.privacy._compile()
        setup = time.perf_counter() - start
        text = ("Surname1500 wrote a long post about cells. " * 5000)[:200_000]
        start = time.perf_counter()
        out = app.privacy.scrub(text)
        elapsed = time.perf_counter() - start
    finally:
        await app.aclose()
    assert "Surname1500" not in out
    assert elapsed < 0.5, elapsed  # measured ~25 ms
    assert setup < 6.0, setup  # one-off per roster change; measured ~1.5 s
