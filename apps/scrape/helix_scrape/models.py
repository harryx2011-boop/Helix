"""The /fetch wire shape. Field names and meanings are the Rust service's (apps/fetch)."""

from __future__ import annotations

from typing import Any

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


class CookieIn(BaseModel):
    """A cookie to set before the page loads. Without a domain it belongs to the page URL."""

    name: str
    value: str
    domain: str | None = None
    path: str | None = None
    secure: bool | None = None
    http_only: bool | None = None


class Screen(BaseModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class RenderIdentity(BaseModel):
    """A caller's profile, resolved by the API: what the browser presents instead of its own.

    The API owns the definitions and the keyed fingerprint script; this service applies them.
    """

    # Reported back as `profile_used` once applied.
    id: str
    user_agent: str | None = None
    accept_language: str | None = None
    timezone: str | None = None
    screen: Screen | None = None
    # Runs before any page script (canvas seed, WebGL, hardware values). Written by the API.
    init_script: str | None = None


class RenderRequest(BaseModel):
    url: str
    # Supplied by the operator or caller. Helix ships no proxy pool.
    proxy: str | None = None
    headers: dict[str, str] | None = None
    # The whole render, Cloudflare solving included, ends by this deadline.
    timeout_ms: int = Field(default=30_000, gt=0)
    # Extra time after the page settles, for late scripts.
    wait_ms: int = Field(default=0, ge=0, le=60_000)
    wait_selector: str | None = None
    network_idle: bool = False
    # The patched browser is always used; stealth adds canvas noise, a WebRTC lock and a
    # search referer. It never solves a challenge on its own.
    stealth: bool = False
    # Opt-in: click through a Cloudflare Turnstile or interstitial. Slow (up to minutes).
    solve_cloudflare: bool = False
    block_ads: bool = False
    # Skip fonts, images, media and stylesheets.
    disable_resources: bool = False
    cookies: list[CookieIn] = Field(default_factory=list)
    allow_private: bool = False
    # A caller's profile. Omit for the browser's own identity.
    identity: RenderIdentity | None = None


class RenderResponse(BaseModel):
    success: bool
    status: int | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    # The rendered DOM, serialized after scripts ran.
    body: str | None = None
    final_url: str | None = None
    # The browser's cookie jar after the render (Playwright cookie objects), cf_clearance
    # included, so the API can keep a host session.
    cookies: list[dict[str, Any]] = Field(default_factory=list)
    # The profile actually presented. Absent when none was asked for or it could not be.
    profile_used: str | None = None
    timing_ms: int = 0
    error: str | None = None

    @classmethod
    def failure(cls, error: str, timing_ms: int) -> RenderResponse:
        return cls(success=False, error=error, timing_ms=timing_ms)
