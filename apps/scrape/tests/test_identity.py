"""A caller's profile on the browser rung: what /render presents when the API sends an identity.

The API owns the profile definitions and the keyed fingerprint script; helix-scrape applies
them the way the API's Playwright pool does: the context's UA, locale, timezone and screen,
the script, and a UA override whose client hints come from the browser's own brand list.
"""

from __future__ import annotations

from helix_scrape.identity import session_options, ua_override
from helix_scrape.models import RenderIdentity, Screen

MAC_137 = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
)

PROBE = {
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) HeadlessChrome/148.0.7778.97 Safari/537.36",
    "brands": [
        {"brand": "Not.A/Brand", "version": "99"},
        {"brand": "HeadlessChrome", "version": "148"},
        {"brand": "Chromium", "version": "148"},
    ],
    "fullVersionList": [
        {"brand": "Not.A/Brand", "version": "99.0.0.0"},
        {"brand": "HeadlessChrome", "version": "148.0.7778.97"},
        {"brand": "Chromium", "version": "148.0.7778.97"},
    ],
    "platform": "Windows",
    "platformVersion": "19.0.0",
    "architecture": "x86",
    "bitness": "64",
}


def _identity(**overrides: object) -> RenderIdentity:
    fields: dict[str, object] = {
        "id": "chrome-137",
        "user_agent": MAC_137,
        "accept_language": "en-GB,en-US;q=0.9,en;q=0.8",
        "timezone": "Europe/London",
        "screen": Screen(width=1728, height=1117),
        "init_script": "window.__helix = 1;",
        **overrides,
    }
    return RenderIdentity.model_validate(fields)


def test_the_profile_sets_the_contexts_ua_locale_timezone_and_screen() -> None:
    assert session_options(_identity()) == {
        "useragent": MAC_137,
        "locale": "en-GB",
        "timezone_id": "Europe/London",
        "additional_args": {"screen": {"width": 1728, "height": 1117}},
    }


def test_a_profile_without_optional_fields_sets_only_what_it_has() -> None:
    bare = _identity(accept_language=None, timezone=None, screen=None)
    assert session_options(bare) == {"useragent": MAC_137}


def test_client_hints_follow_the_profile_on_the_browsers_own_brand_list() -> None:
    override = ua_override(PROBE, _identity())
    assert override["userAgent"] == MAC_137
    # Chrome adds the q-values itself; passing them through doubles them.
    assert override["acceptLanguage"] == "en-GB,en-US,en"
    meta = override["userAgentMetadata"]
    assert meta["brands"] == [
        {"brand": "Not.A/Brand", "version": "99"},
        {"brand": "Google Chrome", "version": "137"},
        {"brand": "Chromium", "version": "137"},
    ]
    assert meta["fullVersionList"][1] == {"brand": "Google Chrome", "version": "137.0.0.0"}
    assert meta["platform"] == "macOS"
    # The probe's Windows version would contradict a macOS UA.
    assert meta["platformVersion"] == ""
    assert meta["mobile"] is False
    assert meta["architecture"] == "x86"


def test_the_browsers_platform_version_is_kept_when_the_platform_matches() -> None:
    windows = _identity(
        user_agent=PROBE["userAgent"].replace("HeadlessChrome/148.0.7778.97", "Chrome/148.0.0.0")
    )
    meta = ua_override(PROBE, windows)["userAgentMetadata"]
    assert meta["platform"] == "Windows"
    assert meta["platformVersion"] == "19.0.0"
    assert meta["brands"][1] == {"brand": "Google Chrome", "version": "148"}
    # Same major: the real full version stays.
    assert meta["fullVersionList"][1] == {"brand": "Google Chrome", "version": "148.0.7778.97"}
