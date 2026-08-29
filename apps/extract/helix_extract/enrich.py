"""Grounding verification for enrichment, at the service that made the call.

The gateway already verifies every enriched field against the pages it fetched.
This module does the same check here, over the content this service actually
sent to the model, and exists for one reason: the two checks have different
blind spots.

The gateway compares a citation against the page text it fetched. This service
compares it against the text that *reached the model* after relevance trimming.
A citation drawn from a part of the page the trimmer dropped is a citation the
model could not have read, and the gateway cannot see that, because from where
it stands the passage is genuinely in the page. That is the shape of a model
reciting memorised text about a well-known company rather than reading the page
in front of it, and it is precisely the case where a plausible wrong answer is
most likely.

Neither check subsumes the other, so both run. A field that fails either one is
not downgraded; it is dropped, and the reason travels with it.

This is a verifier, not an extractor. It calls no model and makes no network
request: given content and a set of claims, it decides which claims the content
supports. That makes it exhaustively testable without a provider.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Literal

# Why a claimed field did not survive. A closed vocabulary, declared as a real
# type rather than described in prose, so a caller cannot invent a reason and a
# typo fails at the boundary instead of becoming a novel string in a response.
GroundingRejection = Literal[
    "no_citation",
    "citation_too_short",
    "citation_not_in_content",
    "value_not_in_citation",
]

# Shortest passage that can identify itself inside a document. Below this a
# "quote" matches somewhere in almost any text by chance, which makes the check
# pass without meaning anything. Kept in step with the gateway's own floor.
MIN_CITATION_CHARS = 24


_WS = re.compile(r"\s+")
_MARKUP = re.compile(r"[*_`#>|]")

# NFKC folds the space variants but NOT the quote and dash variants a markdown
# extractor emits - measured, not assumed. Without this table a model that
# retyped an em dash as a hyphen would have a true citation rejected, so the
# folds are spelled out. Every entry maps a typographic variant onto its ASCII
# form; none maps one letter or digit onto another.
_PUNCTUATION = str.maketrans(
    {
        "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
        "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
        "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
        "―": "-", "−": "-",
        "•": "*", "‣": "*", "◦": "*", "⁃": "*",
    }
)


def normalise(text: str) -> str:
    """Fold the characters extraction and re-typing rewrite, and nothing else.

    NFKC handles the space variants; `_PUNCTUATION` handles the quote and dash
    variants NFKC leaves alone. Together they mean a model that retyped a passage
    is not failed for punctuation it could not have reproduced exactly. Letters
    and digits are untouched, so this can never make two different words compare
    equal.
    """
    folded = unicodedata.normalize("NFKC", text).translate(_PUNCTUATION)
    folded = _MARKUP.sub(" ", folded)
    return _WS.sub(" ", folded).strip().lower()


def _value_text(value: Any) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (str, int, float)):
        return str(value)
    return None


def value_in_citation(value: Any, citation: str) -> bool:
    """Whether a claimed value appears literally inside its own passage.

    Booleans are exempt and report False: a page establishes ``hiring: true`` by
    saying "we are hiring" and never by containing the token "true". That is a
    real weakening for booleans, and it is reported rather than hidden - the
    caller sees ``value_in_citation`` false and can treat the field accordingly.
    """
    text = _value_text(value)
    if text is None:
        return False

    haystack = normalise(citation)
    needle = normalise(text)
    if not needle:
        return False
    if needle in haystack:
        return True

    if isinstance(value, (int, float)):
        # 1200000 written on the page as "1,200,000". Separators are form, not
        # substance, so comparing without them is not a loosening of the test.
        strip = str.maketrans("", "", ", ")
        return needle.translate(strip) in haystack.translate(strip)

    return False


@dataclass
class FieldVerdict:
    """One claim, judged. `value` is None whenever `reason` is set - never both."""

    name: str
    value: Any
    citation: str | None
    grounded: bool
    reason: GroundingRejection | None
    value_in_citation: bool


def verify_fields(content: str, claims: dict[str, Any]) -> list[FieldVerdict]:
    """Judge each claimed field against the content that reached the model.

    `content` is what this service sent, fences and all. A citation is checked
    against it as a whole rather than per-fence, because a value legitimately
    read from one page is still grounded when several pages were supplied.

    A claim missing a value is not a failure - it is the model correctly saying
    the content does not state the field, which is the answer enrichment is
    built to make safe to give. Such a field comes back grounded=False with
    reason=None and value=None, distinguishing "no data" from "bad data".
    """
    haystack = normalise(content)
    verdicts: list[FieldVerdict] = []

    for name, claim in claims.items():
        if not isinstance(claim, dict):
            verdicts.append(FieldVerdict(name, None, None, False, None, False))
            continue

        value = claim.get("value")
        citation = claim.get("citation")

        if value is None or (isinstance(value, str) and not value.strip()):
            verdicts.append(FieldVerdict(name, None, None, False, None, False))
            continue

        if not isinstance(citation, str) or not citation.strip():
            verdicts.append(FieldVerdict(name, None, None, False, "no_citation", False))
            continue

        if len(normalise(citation)) < MIN_CITATION_CHARS:
            verdicts.append(FieldVerdict(name, None, None, False, "citation_too_short", False))
            continue

        if normalise(citation) not in haystack:
            verdicts.append(
                FieldVerdict(name, None, None, False, "citation_not_in_content", False)
            )
            continue

        contained = value_in_citation(value, citation)
        if not isinstance(value, bool) and not contained:
            verdicts.append(
                FieldVerdict(name, None, None, False, "value_not_in_citation", False)
            )
            continue

        verdicts.append(FieldVerdict(name, value, citation, True, None, contained))

    return verdicts


__all__ = [
    "MIN_CITATION_CHARS",
    "FieldVerdict",
    "GroundingRejection",
    "normalise",
    "value_in_citation",
    "verify_fields",
]
