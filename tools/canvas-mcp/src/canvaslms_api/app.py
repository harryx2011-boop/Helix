from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from .client import CanvasClient
from .config import Settings
from .courses import CourseResolver

READ = {"readOnlyHint": True}
WRITE = {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False}
DESTRUCTIVE = {"readOnlyHint": False, "destructiveHint": True, "idempotentHint": False}


@dataclass
class App:
    settings: Settings
    client: CanvasClient
    courses: CourseResolver

    async def course_id(self, identifier: str | int) -> int:
        return await self.courses.resolve(identifier)

    async def course_name(self, course_id: int) -> str:
        return await self.courses.name(course_id)

    def person(self, user: dict[str, Any] | None, fallback: str = "unknown") -> str:
        if not user:
            return fallback
        if self.settings.anonymize_students:
            return self.anonymous_id(user.get("id"))
        return (
            user.get("name")
            or user.get("display_name")
            or user.get("short_name")
            or user.get("sortable_name")
            or fallback
        )

    def anonymous_id(self, user_id: Any) -> str:
        digest = hashlib.sha256(f"{self.settings.host}:{user_id}".encode()).hexdigest()
        return f"Student_{digest[:8]}"

    async def aclose(self) -> None:
        await self.client.aclose()


def build_app(settings: Settings | None = None) -> App:
    settings = settings or Settings.from_env()
    client = CanvasClient(settings)
    return App(settings=settings, client=client, courses=CourseResolver(client, settings.cache_ttl))
