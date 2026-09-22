from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .client import CanvasClient
from .config import Settings
from .courses import CourseResolver
from .privacy import Privacy

READ = {"readOnlyHint": True}
WRITE = {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False}
DESTRUCTIVE = {"readOnlyHint": False, "destructiveHint": True, "idempotentHint": False}


@dataclass
class App:
    settings: Settings
    client: CanvasClient
    courses: CourseResolver
    # "cli" when the terminal front-end drives the server. Re-identification
    # (label -> real name) is allowed there and never over MCP.
    surface: str = "mcp"
    privacy: Privacy = field(default=None)  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.privacy is None:
            self.privacy = Privacy(self.settings, self.client)

    async def course_id(self, identifier: str | int) -> int:
        cid = await self.courses.resolve(identifier)
        if self.privacy.enabled:
            await self.privacy.prepare(cid)
        return cid

    async def course_name(self, course_id: int) -> str:
        return await self.courses.name(course_id)

    def person(self, user: dict[str, Any] | None, fallback: str = "unknown") -> str:
        if self.privacy.enabled:
            return self.privacy.person(user, fallback)
        if not user:
            return fallback
        return (
            user.get("name")
            or user.get("display_name")
            or user.get("short_name")
            or user.get("sortable_name")
            or fallback
        )

    def user_ref(self, user_id: Any) -> str:
        """A raw user id as it may be shown: the student's label when privacy is on."""
        if self.privacy.enabled:
            return self.privacy.user_ref(user_id)
        return str(user_id)

    def anonymous_id(self, user_id: Any) -> str:
        # Keyed HMAC, never a bare hash: Canvas user ids are small, enumerable
        # integers, so sha256(host:id) could be reversed by hashing every id.
        return self.privacy.pseudonym(user_id)

    async def aclose(self) -> None:
        self.privacy.crosswalk.close()
        await self.client.aclose()


def build_app(settings: Settings | None = None, surface: str = "mcp") -> App:
    settings = settings or Settings.from_env()
    client = CanvasClient(settings)
    return App(
        settings=settings,
        client=client,
        courses=CourseResolver(client, settings.cache_ttl),
        surface=surface,
    )
