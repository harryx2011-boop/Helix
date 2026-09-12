"""Semantic chunking with stable anchors.

Two properties matter more than the split algorithm itself.

**Anchors survive a re-crawl.** A citation pointing at chunk 7 breaks the moment
a paragraph is inserted above it. An anchor derived from the chunk's own heading
path and content still resolves, which is what makes a citation worth storing.

**Headings travel with their content.** A chunk beginning mid-section has lost
the context that makes it retrievable — "it costs $29" is useless without the
heading that says what "it" is. So every chunk carries its heading path.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

CHARS_PER_TOKEN = 4

# How much of a chunk's opening identifies it. Short enough that editing a
# paragraph does not break every citation into its section.
ANCHOR_WINDOW_CHARS = 64

_HEADING = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


@dataclass
class Chunk:
    text: str
    anchor: str
    tokens: int
    heading_path: list[str] = field(default_factory=list)
    index: int = 0
    embedding: list[float] | None = None


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


def make_anchor(url: str, heading_path: list[str], text: str) -> str:
    """A stable identifier for a chunk.

    Built from the URL, the heading path, and a hash of the opening of the text.
    Position is deliberately excluded: an anchor that encodes "chunk 7" breaks
    when chunk 3 is edited, and every citation pointing at it silently rots.

    Using only the opening means small edits to the tail of a chunk leave the
    anchor intact, which is usually what a reader wants. The window is short on
    purpose: enough to distinguish two sections, short enough that editing a
    paragraph does not invalidate every citation into it.
    """
    slug = "/".join(
        re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-") for heading in heading_path
    )

    opening = re.sub(r"\s+", " ", text[:ANCHOR_WINDOW_CHARS]).strip().lower()
    digest = hashlib.sha256(opening.encode("utf-8")).hexdigest()[:12]

    return f"{url}#{slug}:{digest}" if slug else f"{url}#{digest}"


def _heading_level(line: str) -> int | None:
    match = _HEADING.match(line)
    return len(match.group(1)) if match else None


def _split_by_heading(markdown: str) -> list[tuple[list[str], str]]:
    """Split into sections, each tagged with the heading path above it."""
    lines = markdown.split("\n")
    sections: list[tuple[list[str], str]] = []

    path: list[str] = []
    buffer: list[str] = []

    def flush() -> None:
        body = "\n".join(buffer).strip()
        if body:
            sections.append((list(path), body))
        buffer.clear()

    for line in lines:
        level = _heading_level(line)
        if level is None:
            buffer.append(line)
            continue

        flush()

        title = line.lstrip("#").strip()
        # Truncate the path to the parent level, then append this heading, so a
        # deeper heading nests and a shallower one resets.
        path = path[: level - 1]
        path.append(title)

    flush()
    return sections


def _pack_sentences(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    """Pack sentences into chunks, never splitting mid-sentence when avoidable.

    A chunk cut mid-sentence retrieves badly: the fragment reads as incoherent
    to an embedding model and to whoever eventually sees the citation.
    """
    sentences = _SENTENCE_END.split(text)
    chunks: list[str] = []
    current: list[str] = []
    size = 0

    for sentence in sentences:
        sentence_len = len(sentence) + 1

        if size + sentence_len > max_chars and current:
            chunks.append(" ".join(current).strip())

            # Carry the tail of the previous chunk so a fact spanning the
            # boundary is still retrievable from both sides.
            if overlap_chars > 0:
                carried: list[str] = []
                carried_size = 0
                for previous in reversed(current):
                    if carried_size + len(previous) > overlap_chars:
                        break
                    carried.insert(0, previous)
                    carried_size += len(previous) + 1
                current = carried
                size = carried_size
            else:
                current = []
                size = 0

        # A single sentence over the budget has to be split; there is no
        # boundary left to respect.
        if sentence_len > max_chars:
            if current:
                chunks.append(" ".join(current).strip())
                current, size = [], 0
            for start in range(0, len(sentence), max_chars):
                chunks.append(sentence[start : start + max_chars].strip())
            continue

        current.append(sentence)
        size += sentence_len

    if current:
        chunks.append(" ".join(current).strip())

    return [chunk for chunk in chunks if chunk]


def chunk_markdown(
    markdown: str,
    url: str,
    strategy: str = "semantic",
    max_tokens: int = 512,
    overlap: int = 64,
) -> list[Chunk]:
    """Split markdown into retrievable chunks.

    - ``heading``  — one chunk per section, however large.
    - ``fixed``    — fixed-size windows, ignoring structure.
    - ``semantic`` — sections split on sentence boundaries when oversized.
    """
    max_chars = max_tokens * CHARS_PER_TOKEN
    # An overlap at or beyond the budget re-carries a whole chunk forward on
    # every split, so chunks only grow and never make progress through the
    # document. Clamping keeps a direct caller from producing that.
    overlap_chars = min(overlap, max_tokens - 1) * CHARS_PER_TOKEN if overlap > 0 else 0

    if not markdown.strip():
        return []

    chunks: list[Chunk] = []

    if strategy == "fixed":
        # A stride of zero or less would yield no chunks at all, silently
        # returning an empty result for a document that plainly has content.
        stride = max(1, max_chars - overlap_chars)
        for start in range(0, len(markdown), stride):
            body = markdown[start : start + max_chars].strip()
            if body:
                chunks.append(
                    Chunk(
                        text=body,
                        anchor=make_anchor(url, [], body),
                        tokens=estimate_tokens(body),
                        index=len(chunks),
                    )
                )
        return chunks

    for heading_path, body in _split_by_heading(markdown):
        prefix = "\n".join(f"{'#' * (i + 1)} {h}" for i, h in enumerate(heading_path))

        if strategy == "heading" or len(body) <= max_chars:
            # Headings are prepended so a chunk read in isolation still says
            # what it is about.
            text = f"{prefix}\n\n{body}".strip() if prefix else body
            chunks.append(
                Chunk(
                    text=text,
                    anchor=make_anchor(url, heading_path, body),
                    tokens=estimate_tokens(text),
                    heading_path=heading_path,
                    index=len(chunks),
                )
            )
            continue

        budget = max_chars - len(prefix) - 2 if prefix else max_chars
        for part in _pack_sentences(body, max(budget, 200), overlap_chars):
            text = f"{prefix}\n\n{part}".strip() if prefix else part
            chunks.append(
                Chunk(
                    text=text,
                    anchor=make_anchor(url, heading_path, part),
                    tokens=estimate_tokens(text),
                    heading_path=heading_path,
                    index=len(chunks),
                )
            )

    return chunks
