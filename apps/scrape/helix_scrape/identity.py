"""A caller's profile on the browser rung, applied the way the API's Playwright pool applies it.

The context gets the profile's UA, locale, timezone and screen, and the API's fingerprint
script. The context UA alone would leave `sec-ch-ua` and `navigator.userAgentData` at the
browser's real version, so a CDP UA override sets the client hints too: the browser's own
brand list (GREASE entry and order kept) with the headless brand renamed and the version
moved to the profile's. The mirror of `userAgentOverride` in `apps/api/src/browser/profiles.ts`.
"""

from __future__ import annotations

import re
from typing import Any

from helix_scrape.models import RenderIdentity

# `navigator.userAgentData` exists only in a secure context, and about:blank is not one, so
# the brand list is read on a URL the route answers itself; it never leaves the browser.
_PROBE_URL = "https://identity.invalid/"
_PROBE_JS = """async () => {
  const d = navigator.userAgentData;
  const high = await d.getHighEntropyValues(
    ['fullVersionList', 'platformVersion', 'architecture', 'bitness']);
  return { userAgent: navigator.userAgent, brands: d.brands, platform: d.platform, ...high };
}"""
_OWN_BRANDS = ("HeadlessChrome", "Chromium", "Google Chrome")


def session_options(identity: RenderIdentity) -> dict[str, Any]:
    """The Scrapling session options a profile sets."""
    options: dict[str, Any] = {}
    if identity.user_agent:
        options["useragent"] = identity.user_agent
    if identity.accept_language:
        # Scrapling turns this into --lang and --accept-lang, so workers and Intl follow too.
        options["locale"] = identity.accept_language.split(",")[0].split(";")[0].strip()
    if identity.timezone:
        options["timezone_id"] = identity.timezone
    if identity.screen:
        screen = {"width": identity.screen.width, "height": identity.screen.height}
        options["additional_args"] = {"screen": screen}
    return options


def _platform_of(user_agent: str) -> str | None:
    if "Windows" in user_agent:
        return "Windows"
    if "Mac OS X" in user_agent:
        return "macOS"
    if "Android" in user_agent:
        return "Android"
    if re.search(r"Linux|X11", user_agent):
        return "Linux"
    return None


def ua_override(probe: dict[str, Any], identity: RenderIdentity) -> dict[str, Any]:
    """`Emulation.setUserAgentOverride` params for the profile, on the probed browser."""
    user_agent = identity.user_agent or str(probe["userAgent"])
    found = re.search(r"Chrome/(\d+)", user_agent)
    major = found.group(1) if found else None

    def rebrand(brands: list[dict[str, str]], full: bool) -> list[dict[str, str]]:
        out = []
        for entry in brands:
            brand, version = entry["brand"], entry["version"]
            if brand not in _OWN_BRANDS:
                out.append({"brand": brand, "version": version})
                continue
            renamed = "Google Chrome" if brand == "HeadlessChrome" else brand
            if not major or version.split(".")[0] == major:
                out.append({"brand": renamed, "version": version})
            else:
                out.append({"brand": renamed, "version": f"{major}.0.0.0" if full else major})
        return out

    platform = _platform_of(user_agent) or str(probe["platform"])
    language = identity.accept_language or "en-US,en"
    return {
        "userAgent": user_agent,
        # Chrome adds the q-values itself; passing them through doubles them.
        "acceptLanguage": ",".join(tag.split(";")[0].strip() for tag in language.split(",")),
        "userAgentMetadata": {
            "brands": rebrand(probe["brands"], False),
            "fullVersionList": rebrand(probe["fullVersionList"], True),
            "platform": platform,
            "platformVersion": probe["platformVersion"] if platform == probe["platform"] else "",
            "architecture": probe["architecture"],
            "model": "",
            "mobile": False,
            "bitness": probe["bitness"],
            "wow64": False,
        },
    }


async def _probe(page: Any) -> dict[str, Any]:
    probe = await page.context.new_page()
    try:
        await probe.route(
            _PROBE_URL, lambda route: route.fulfill(body="<html></html>", content_type="text/html")
        )
        await probe.goto(_PROBE_URL)
        result: dict[str, Any] = await probe.evaluate(_PROBE_JS)
        return result
    finally:
        await probe.close()


async def present(page: Any, identity: RenderIdentity) -> Any:
    """Applies the script and the UA override to `page` before it navigates.

    Returns the CDP session, which must stay attached: detaching it drops the override.
    """
    if identity.init_script:
        await page.add_init_script(script=identity.init_script)
    override = ua_override(await _probe(page), identity)
    session = await page.context.new_cdp_session(page)
    await session.send("Emulation.setUserAgentOverride", override)
    return session
