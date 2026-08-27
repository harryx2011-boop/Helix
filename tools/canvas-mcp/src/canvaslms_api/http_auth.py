from __future__ import annotations

import hmac
import ipaddress

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

SECRET_SEGMENT = "s"


def secret_url(base: str, token: str, path: str = "/mcp") -> str:
    """Build the connector URL that carries the shared secret in its path."""
    return f"{base.rstrip('/')}/{SECRET_SEGMENT}/{token}{path}"


def is_loopback(host: str) -> bool:
    if host in {"localhost", ""}:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class SharedSecretGuard:
    """Require a shared secret on every HTTP request before it reaches MCP.

    The secret travels one of two ways:

    - `Authorization: Bearer <token>`, for clients that can send a header
      (Claude Code, Cursor, curl).
    - an `/s/<token>` path prefix, for clients whose only input is a URL.
      claude.ai custom connectors are why this exists: the connector dialog
      takes a URL and nothing else. The prefix is moved into the ASGI
      `root_path` so routing ignores it and both routes land on the same
      endpoint, while redirects the app generates keep the prefix.
    """

    def __init__(self, app: ASGIApp, token: str) -> None:
        self.app = app
        self.token = token

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if self._path_secret_matches(scope.get("path", "/")):
            await self.app(self._mount_under_secret(scope), receive, send)
            return

        if self._bearer_matches(scope):
            await self.app(scope, receive, send)
            return

        response = PlainTextResponse(
            "Unauthorized",
            status_code=401,
            headers={"WWW-Authenticate": 'Bearer realm="canvaslms-api"'},
        )
        await response(scope, receive, send)

    def _path_secret_matches(self, path: str) -> bool:
        """True when the path starts with `/s/<token>`."""
        parts = path.split("/", 3)
        return (
            len(parts) >= 3
            and parts[1] == SECRET_SEGMENT
            and hmac.compare_digest(parts[2], self.token)
        )

    def _mount_under_secret(self, scope: Scope) -> Scope:
        """Move the secret prefix into root_path so the app routes below it.

        ASGI keeps the prefix in `path` and names it in `root_path`; Starlette
        subtracts one from the other when routing. Rewriting `path` instead
        would make the app generate redirects that drop the secret.
        """
        mounted = dict(scope)
        mounted["root_path"] = scope.get("root_path", "") + f"/{SECRET_SEGMENT}/{self.token}"
        return mounted

    def _bearer_matches(self, scope: Scope) -> bool:
        for key, value in scope.get("headers", ()):
            if key != b"authorization":
                continue
            scheme, _, credentials = value.decode("latin-1").partition(" ")
            if scheme.lower() != "bearer":
                return False
            return hmac.compare_digest(credentials.strip(), self.token)
        return False
