from __future__ import annotations

import asyncio
import time
from typing import Any

from .client import CanvasClient, CanvasError, PageList

ACTIVE_PARAMS: dict[str, Any] = {
    "enrollment_state": "active",
    "include[]": ["term", "total_scores", "favorites"],
}


class CourseResolver:
    def __init__(self, client: CanvasClient, ttl: int):
        self._client = client
        self._ttl = ttl
        self._courses: PageList | None = None
        self._loaded_at = 0.0
        self._lock = asyncio.Lock()
        self._last_invalidated_by: str | None = None

    @property
    def stale(self) -> bool:
        return self._courses is None or (time.monotonic() - self._loaded_at) > self._ttl

    def status(self) -> dict[str, Any]:
        age = int(time.monotonic() - self._loaded_at) if self._courses is not None else None
        return {
            "cached_courses": len(self._courses) if self._courses is not None else 0,
            "age_seconds": age,
            "ttl_seconds": self._ttl,
            "stale": self.stale,
            "last_invalidated_by": self._last_invalidated_by,
        }

    def clear(self, invalidated_by: str | None = None) -> None:
        self._courses = None
        self._loaded_at = 0.0
        if invalidated_by is not None:
            self._last_invalidated_by = invalidated_by

    async def active(self, force: bool = False) -> PageList:
        if force or self.stale:
            async with self._lock:
                if force or self.stale:
                    self._courses = await self._client.get_all("/courses", ACTIVE_PARAMS)
                    self._loaded_at = time.monotonic()
        return PageList(self._courses or [], capped=bool(self._courses and self._courses.capped))

    async def all(self) -> PageList:
        return await self._client.get_all(
            "/courses",
            {"include[]": ["term", "total_scores"], "state[]": ["available", "completed"]},
        )

    async def resolve(self, identifier: str | int) -> int:
        text = str(identifier).strip()
        if not text:
            raise CanvasError(400, "course identifier is empty", "Pass a course id, code, or name.")
        if text.isdigit():
            return int(text)
        if text.startswith("sis_course_id:"):
            course = await self._client.get(f"/courses/{text}")
            return int(course["id"])
        match = self._match(await self.active(), text)
        if match is None and not self._just_loaded():
            match = self._match(await self.active(force=True), text)
        if match is None:
            raise CanvasError(
                404,
                f"no enrolled course matches {text!r}",
                "Use list_courses to see course codes and ids.",
            )
        return int(match["id"])

    async def get(self, identifier: str | int, include: list[str] | None = None) -> dict[str, Any]:
        course_id = await self.resolve(identifier)
        params = {"include[]": include} if include else None
        return await self._client.get(f"/courses/{course_id}", params)

    async def name(self, course_id: int) -> str:
        for course in await self.active():
            if course.get("id") == course_id:
                return course.get("name") or course.get("course_code") or str(course_id)
        course = await self._client.get(f"/courses/{course_id}")
        return course.get("name") or course.get("course_code") or str(course_id)

    def _just_loaded(self) -> bool:
        return self._courses is not None and (time.monotonic() - self._loaded_at) < 5

    @staticmethod
    def _match(courses: list[dict[str, Any]], text: str) -> dict[str, Any] | None:
        needle = text.casefold()

        def code(course: dict[str, Any]) -> str:
            return (course.get("course_code") or "").casefold()

        def name(course: dict[str, Any]) -> str:
            return (course.get("name") or "").casefold()

        exact = [c for c in courses if code(c) == needle or name(c) == needle]
        if len(exact) == 1:
            return exact[0]
        if len(exact) > 1:
            raise _ambiguous(text, exact)
        partial = [c for c in courses if needle in code(c) or needle in name(c)]
        if len(partial) == 1:
            return partial[0]
        if len(partial) > 1:
            raise _ambiguous(text, partial)
        return None


def _ambiguous(text: str, candidates: list[dict[str, Any]]) -> CanvasError:
    listing = "; ".join(
        f"{c.get('name') or c.get('course_code')} (id {c.get('id')})" for c in candidates[:8]
    )
    return CanvasError(
        409,
        f"{text!r} matches {len(candidates)} courses: {listing}",
        "Pass the numeric course id instead.",
    )
