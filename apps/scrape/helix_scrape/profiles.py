"""Helix identity names mapped onto curl_cffi impersonation targets.

Helix named 44 identities (Chrome 131-149, Edge 127-148, Safari 17.5-26.4, iOS Safari) for the
Rust client. curl_cffi ships a sparser set, so a name resolves to the nearest target in its
family and the response reports the target actually sent (`profile_used`). The old default
(Chrome 149) lands on chrome150. Edge has no target beyond edge101, so an Edge name sends a
Chrome one and says so: an Edge label on a Chrome handshake would be an incoherent identity.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Desktop Windows targets only; the macOS and Android variants are left out on purpose.
_CHROME: dict[float, str] = {
    99: "chrome99", 100: "chrome100", 101: "chrome101", 104: "chrome104", 107: "chrome107",
    110: "chrome110", 116: "chrome116", 119: "chrome119", 120: "chrome120", 123: "chrome123",
    124: "chrome124", 131: "chrome131", 133: "chrome133a", 136: "chrome136", 142: "chrome142",
    145: "chrome145", 146: "chrome146", 150: "chrome150", 151: "chrome151", 152: "chrome152",
}  # fmt: skip
_SAFARI: dict[float, str] = {
    15.3: "safari153", 15.5: "safari155", 17.0: "safari170", 18.0: "safari180",
    18.4: "safari184", 26.0: "safari260", 26.01: "safari2601", 27.0: "safari270",
}  # fmt: skip
_SAFARI_IOS: dict[float, str] = {
    17.2: "safari172_ios", 18.0: "safari180_ios", 18.4: "safari184_ios",
    26.0: "safari260_ios", 27.0: "safari270_ios",
}  # fmt: skip

_FAMILY = re.compile(r"^(chrome|edge)(?:-(\d+))?$")
_SAFARI_NAME = re.compile(r"^safari(-ios)?(?:-(\d+)(?:-(\d+))?(?:-\d+)?)?$")

_CHROME_ASKED_FOR_BY_DEFAULT = 149  # Helix's old default; the nearest target is used


def _nearest(table: dict[float, str], wanted: float) -> str:
    # Equal distance goes to the lower version: an older identity is the safer guess.
    return table[min(table, key=lambda v: (abs(v - wanted), v))]


DEFAULT_TARGET = _nearest(_CHROME, _CHROME_ASKED_FOR_BY_DEFAULT)


@dataclass(frozen=True)
class Resolved:
    id: str  # what is reported as `profile_used`
    target: str  # the curl_cffi `impersonate` value


def available() -> list[str]:
    """Every target this build can present."""
    return [*_CHROME.values(), *_SAFARI.values(), *_SAFARI_IOS.values()]


def windows_headers(target: str) -> dict[str, str]:
    """The OS-visible headers for a Chrome target, set to Windows.

    curl_cffi's Chrome targets present macOS. The TLS and HTTP/2 fingerprints are the same
    on every OS, so only these two headers change, and the Rust service presented Windows.
    """
    match = re.fullmatch(r"chrome(\d+)a?", target)
    if not match:
        return {}
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            f"(KHTML, like Gecko) Chrome/{match.group(1)}.0.0.0 Safari/537.36"
        ),
        "sec-ch-ua-platform": '"Windows"',
    }


def _resolved(target: str) -> Resolved:
    return Resolved(id=target, target=target)


def resolve(name: str | None) -> Resolved:
    """Map a Helix identity name, or a curl_cffi target, to the target to send.

    An unknown name gets the default rather than an error, as it did in the Rust service; the
    result names what was used, so the substitution is visible.
    """
    if not name:
        return _resolved(DEFAULT_TARGET)
    name = name.strip().lower()
    if name in available():
        return _resolved(name)

    family = _FAMILY.match(name)
    if family:  # Edge shares Chromium, so it takes the nearest Chrome target
        version = family.group(2)
        return _resolved(_nearest(_CHROME, int(version)) if version else DEFAULT_TARGET)

    safari = _SAFARI_NAME.match(name)
    if safari:
        table = _SAFARI_IOS if safari.group(1) else _SAFARI
        if safari.group(2) is None:
            return _resolved(table[max(table)])
        wanted = int(safari.group(2)) + int(safari.group(3) or 0) / 10
        return _resolved(_nearest(table, wanted))

    return _resolved(DEFAULT_TARGET)
