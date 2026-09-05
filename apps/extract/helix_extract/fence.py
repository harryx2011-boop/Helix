"""Structural fence for untrusted content (rules/prompt-assembly.md).

Content sent to a provider is concatenated into the same user message as the
operator's own prompt. A prose instruction telling the model to treat that
content as data is not a boundary — content saying "ignore the above" is
otherwise indistinguishable from the operator's own instruction, since both
arrive as plain text in the same message. This wraps the content structurally
instead, so the fence is machine-visible rather than merely stated.

TS reference: apps/notes agent's fence.ts (Luminous). Same shape, same rule:
defang the terminator so payload text cannot close its own fence, and
sanitize the origin attribute.

This module does not restrict output to ASCII. The fenced text reaches a
provider only as UTF-8 HTTP JSON body content (llm.py), never a console or
log sink, and page content routinely contains non-ASCII (curly quotes, em
dashes, accented names, CJK) that would be corrupted by forcing it to ASCII.
A caller that adds a console/log sink for fenced content on a cp1252 Windows
console must encode defensively at that sink (see rules/prompt-assembly.md
§1) — this module does not do it for them.
"""

from __future__ import annotations

_CLOSE = "</untrusted>"


def _defang_payload(text: str) -> str:
    return text.replace("</", "<\\/")


def _defang_origin(origin: str) -> str:
    # Defang and quote-escape only — see module docstring for why this does
    # not also restrict to ASCII.
    safe = _defang_payload(origin).replace('"', "&quot;")
    return " ".join(safe.split())


def wrap(text: str, origin: str) -> str:
    """Wrap untrusted text in a structural fence naming its origin.

    Clip `text` to a budget before calling this, never after — slicing a
    wrapped string can take the closing tag with it.
    """
    return f'<untrusted origin="{_defang_origin(origin)}">{_defang_payload(text)}{_CLOSE}'


__all__ = ["wrap"]
