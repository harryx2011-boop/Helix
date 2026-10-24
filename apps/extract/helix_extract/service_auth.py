"""The shared secret between the API and this service.

When HELIX_SERVICE_TOKEN is set, every route but /health answers only a
request that carries it, so another process or container that can reach the
port cannot drive the service directly. Unset keeps the open behaviour for
setups that bind loopback only. Read per request, so tests can set it.
"""

from __future__ import annotations

import hmac
import os
from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse, Response

HEADER = "x-helix-service-token"
OPEN_PATHS = frozenset({"/health"})


async def require_service_token(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    expected = os.environ.get("HELIX_SERVICE_TOKEN", "")
    if expected and request.url.path not in OPEN_PATHS:
        presented = request.headers.get(HEADER, "")
        if not hmac.compare_digest(presented.encode(), expected.encode()):
            return JSONResponse(
                status_code=401, content={"detail": "missing or invalid service token"}
            )
    return await call_next(request)
