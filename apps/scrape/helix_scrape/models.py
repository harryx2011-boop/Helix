"""The /fetch wire shape. Field names and meanings are the Rust service's (apps/fetch)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class FetchRequest(BaseModel):
    url: str
    # Browser identity to present. Omit for the default.
    profile: str | None = None
    # Supplied by the operator. Helix ships no proxy pool.
    proxy: str | None = None
    headers: dict[str, str] | None = None
    timeout_ms: int = Field(default=30_000, gt=0)
    # False for tier 0 (plain), true for tier 1 (impersonating).
    impersonate: bool = True
    # Operator opt-in. Off, the request and every redirect hop must resolve to a public
    # address; the core has checked the URL it sends, and this closes the redirect a
    # check-before-fetch cannot see.
    allow_private: bool = False


class FetchResponse(BaseModel):
    success: bool
    status: int | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    # Every Set-Cookie value; `headers` keeps only one of them.
    set_cookies: list[str] = Field(default_factory=list)
    body: str | None = None
    # Which identity was actually presented, so a failure can be reproduced.
    profile_used: str | None = None
    final_url: str | None = None
    timing_ms: int = 0
    error: str | None = None

    @classmethod
    def failure(cls, error: str, timing_ms: int) -> FetchResponse:
        return cls(success=False, error=error, timing_ms=timing_ms)


class Health(BaseModel):
    status: str
    version: str
    # Identities this build can present.
    profiles_loaded: int
    # Kept for the health contract; the JS-layer definitions are read by the API now.
    definitions_loaded: int = 0
