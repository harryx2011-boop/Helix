from __future__ import annotations

import pytest
import respx

from canvaslms_api.client import CanvasClient, CanvasError
from canvaslms_api.config import Settings
from canvaslms_api.courses import CourseResolver

COURSES = [
    {"id": 1, "name": "Intro to Biology", "course_code": "BIO101"},
    {"id": 2, "name": "Advanced Biology", "course_code": "BIO301"},
    {"id": 3, "name": "Calculus I", "course_code": "MATH101"},
]


@pytest.fixture
def client(settings: Settings) -> CanvasClient:
    return CanvasClient(settings)


@pytest.fixture
def resolver(client: CanvasClient, settings: Settings) -> CourseResolver:
    return CourseResolver(client, settings.cache_ttl)


def _mock_active(mock: respx.MockRouter, courses: list[dict] | None = None) -> respx.Route:
    return mock.get("https://canvas.test/api/v1/courses", params={"per_page": "100"}).respond(
        json=courses if courses is not None else COURSES
    )


async def test_resolve_numeric_string(resolver: CourseResolver) -> None:
    assert await resolver.resolve("42") == 42


async def test_resolve_int(resolver: CourseResolver) -> None:
    assert await resolver.resolve(42) == 42


async def test_resolve_sis_course_id(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    mock.get("https://canvas.test/api/v1/courses/sis_course_id:ABC").respond(json={"id": 99})
    assert await resolver.resolve("sis_course_id:ABC") == 99


async def test_resolve_exact_code_match(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    _mock_active(mock)
    assert await resolver.resolve("BIO101") == 1


async def test_resolve_exact_name_match(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    _mock_active(mock)
    assert await resolver.resolve("Calculus I") == 3


async def test_resolve_case_insensitive(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    _mock_active(mock)
    assert await resolver.resolve("bio101") == 1


async def test_resolve_unique_partial_match(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    _mock_active(mock)
    assert await resolver.resolve("calc") == 3


async def test_resolve_ambiguous_raises_409_with_candidates(
    resolver: CourseResolver, mock: respx.MockRouter
) -> None:
    _mock_active(mock)
    with pytest.raises(CanvasError) as exc_info:
        await resolver.resolve("biology")
    err = exc_info.value
    assert err.status == 409
    assert "Intro to Biology" in err.message
    assert "Advanced Biology" in err.message


async def test_resolve_no_match_refreshes_once_then_404(
    resolver: CourseResolver, mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    route = _mock_active(mock)
    # Prime the cache "long ago" so the not-just-loaded refresh path triggers:
    # resolve() skips the extra refresh if the cache was populated within 5s.
    times = iter([0.0, 0.0, 100.0, 100.0, 100.0])

    def fake_monotonic() -> float:
        try:
            return next(times)
        except StopIteration:
            return 100.0

    monkeypatch.setattr("canvaslms_api.courses.time.monotonic", fake_monotonic)
    await resolver.active()

    with pytest.raises(CanvasError) as exc_info:
        await resolver.resolve("nonexistent")
    err = exc_info.value
    assert err.status == 404
    assert route.call_count == 2


async def test_active_cache_within_ttl_no_second_network_call(
    resolver: CourseResolver, mock: respx.MockRouter
) -> None:
    route = _mock_active(mock)
    await resolver.active()
    await resolver.active()
    assert route.call_count == 1


async def test_active_cache_stale_after_ttl(
    resolver: CourseResolver, mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
) -> None:
    route = _mock_active(mock)
    times = iter([0.0, 1000.0, 1000.0, 1000.0])

    def fake_monotonic() -> float:
        try:
            return next(times)
        except StopIteration:
            return 1000.0

    monkeypatch.setattr("canvaslms_api.courses.time.monotonic", fake_monotonic)
    await resolver.active()
    await resolver.active()
    assert route.call_count == 2


async def test_status_and_clear(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    assert resolver.status()["cached_courses"] == 0
    assert resolver.status()["age_seconds"] is None
    _mock_active(mock)
    await resolver.active()
    status = resolver.status()
    assert status["cached_courses"] == len(COURSES)
    assert status["stale"] is False
    resolver.clear()
    status = resolver.status()
    assert status["cached_courses"] == 0
    assert status["age_seconds"] is None


async def test_name_from_cache(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    route = _mock_active(mock)
    await resolver.active()
    name = await resolver.name(1)
    assert name == "Intro to Biology"
    assert route.call_count == 1


async def test_name_falls_back_to_fetch(resolver: CourseResolver, mock: respx.MockRouter) -> None:
    _mock_active(mock, courses=[])
    mock.get("https://canvas.test/api/v1/courses/55").respond(json={"id": 55, "name": "Fetched Course"})
    name = await resolver.name(55)
    assert name == "Fetched Course"
