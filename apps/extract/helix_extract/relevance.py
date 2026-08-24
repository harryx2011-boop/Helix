"""Relevance scoring and trimming, run before the model sees anything.

Dumping a whole page into a context window is the expensive way to get a worse
answer. A long page pushes the fields you asked about into the middle, where
attention is weakest, and you pay for every token of navigation chrome.

So: split into blocks, score each against what the schema is asking for, and
send the best of them in original order. Cheaper and more accurate at once,
which is unusual enough to be worth doing properly.

Scoring is lexical rather than semantic — deliberately. An embedding pass per
page would cost more than the extraction it is meant to make cheaper, and the
signal here (does this block mention the words in the schema?) is one that term
overlap already answers well.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

CHARS_PER_TOKEN = 4

# Words too common to distinguish one block from another.
STOPWORDS = frozenset(
    """
    a an the and or but if then else of in on at to for with by from as is are was were
    be been being have has had do does did will would shall should may might must can
    could this that these those it its it's i you he she we they them their there here
    what which who whom when where why how all any both each few more most other some
    such no nor not only own same so than too very just about into over after before
    """.split()
)

_WORD = re.compile(r"[a-z0-9][a-z0-9'-]*")


@dataclass
class Block:
    text: str
    score: float
    index: int


@dataclass
class Selection:
    """What reached the model, and how much of the page that was."""

    text: str
    # The passages sent, in original order. Reported back as `sources` on request.
    kept: list[Block]
    # 0 when the page fit the budget and nothing was trimmed.
    kept_count: int
    total: int


def _terms(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in STOPWORDS and len(w) > 1]


def schema_terms(schema: dict, prompt: str | None = None) -> set[str]:
    """The vocabulary a schema is asking about.

    Field names, descriptions and examples all contribute. A schema asking for
    ``fundingRound`` should pull blocks mentioning funding, and splitting the
    camelCase is what makes that work.
    """
    collected: list[str] = []

    def walk(node: object, key: str | None = None) -> None:
        if key:
            # fundingRound -> funding round
            spaced = re.sub(r"(?<!^)(?=[A-Z])", " ", key)
            collected.extend(_terms(spaced))

        if isinstance(node, dict):
            for field in ("description", "title"):
                value = node.get(field)
                if isinstance(value, str):
                    collected.extend(_terms(value))

            examples = node.get("examples")
            if isinstance(examples, list):
                for example in examples:
                    if isinstance(example, str):
                        collected.extend(_terms(example))

            enum = node.get("enum")
            if isinstance(enum, list):
                for value in enum:
                    if isinstance(value, str):
                        collected.extend(_terms(value))

            properties = node.get("properties")
            if isinstance(properties, dict):
                for child_key, child in properties.items():
                    walk(child, child_key)

            items = node.get("items")
            if isinstance(items, dict):
                walk(items)

    walk(schema)

    if prompt:
        collected.extend(_terms(prompt))

    return set(collected)


def split_blocks(markdown: str) -> list[str]:
    """Split on blank lines, keeping headings attached to what follows.

    A heading alone scores poorly and carries the context its section needs, so
    detaching it loses exactly the signal that makes the section findable.
    """
    raw = [block.strip() for block in re.split(r"\n\s*\n", markdown) if block.strip()]

    merged: list[str] = []
    pending_heading: str | None = None

    for block in raw:
        is_heading = block.startswith("#") and len(block) < 200

        if is_heading:
            if pending_heading:
                merged.append(pending_heading)
            pending_heading = block
            continue

        if pending_heading:
            merged.append(f"{pending_heading}\n\n{block}")
            pending_heading = None
        else:
            merged.append(block)

    if pending_heading:
        merged.append(pending_heading)

    return merged


def score_block(block: str, wanted: set[str]) -> float:
    """How well a block matches what is being asked for.

    Distinct matched terms beat repetition — a block saying "price" ten times is
    not ten times more relevant than one saying it once — and the result is
    length-normalised so a long block cannot win on volume alone.
    """
    if not wanted:
        return 0.0

    terms = _terms(block)
    if not terms:
        return 0.0

    matched = {term for term in terms if term in wanted}
    coverage = len(matched) / len(wanted)

    density = len(matched) / math.sqrt(len(terms))

    return coverage * 2.0 + density


def trim_to_budget(
    markdown: str,
    schema: dict,
    prompt: str | None = None,
    max_tokens: int = 8_000,
) -> tuple[str, int, int]:
    """Trim content to a token budget, keeping the most relevant parts.

    Returns the trimmed text, how many blocks were kept, and how many existed.
    """
    selection = select(markdown, schema, prompt, max_tokens=max_tokens)
    return selection.text, selection.kept_count, selection.total


def select(
    markdown: str,
    schema: dict,
    prompt: str | None = None,
    max_tokens: int = 8_000,
) -> Selection:
    """Choose what reaches the model within a token budget.

    Selected blocks are re-emitted in their original order: a document reordered
    by score reads as nonsense, and the model does worse on it.
    """
    budget_chars = max_tokens * CHARS_PER_TOKEN
    wanted = schema_terms(schema, prompt)

    if len(markdown) <= budget_chars:
        whole = [
            Block(text=block, score=score_block(block, wanted), index=i)
            for i, block in enumerate(split_blocks(markdown))
        ]
        return Selection(text=markdown, kept=whole, kept_count=0, total=0)

    blocks = split_blocks(markdown)
    if not blocks:
        excerpt = markdown[:budget_chars]
        return Selection(text=excerpt, kept=[Block(text=excerpt, score=0.0, index=0)], kept_count=0, total=0)

    scored = [Block(text=block, score=score_block(block, wanted), index=i) for i, block in enumerate(blocks)]

    # With no usable signal, the opening of the document is the best guess —
    # titles, summaries and lead paragraphs live there.
    if all(block.score == 0 for block in scored):
        kept: list[Block] = []
        used = 0
        for block in scored:
            if used + len(block.text) > budget_chars:
                break
            kept.append(block)
            used += len(block.text) + 2

        # A single block larger than the whole budget would otherwise return
        # nothing at all, which reads as "this page was empty". Truncating the
        # first block is a worse answer than a clean excerpt but a far better
        # one than silence.
        if not kept:
            excerpt = blocks[0][:budget_chars]
            return Selection(
                text=excerpt,
                kept=[Block(text=excerpt, score=scored[0].score, index=0)],
                kept_count=1,
                total=len(blocks),
            )

        return Selection(
            text="\n\n".join(b.text for b in kept), kept=kept, kept_count=len(kept), total=len(blocks)
        )

    ranked = sorted(scored, key=lambda b: b.score, reverse=True)

    kept = []
    used = 0
    for block in ranked:
        cost = len(block.text) + 2
        if used + cost > budget_chars:
            continue
        kept.append(block)
        used += cost

    # Every block individually over budget — take the highest-scoring one,
    # truncated. Returning nothing would look like an empty page.
    if not kept and ranked:
        best = ranked[0]
        excerpt = best.text[:budget_chars]
        return Selection(
            text=excerpt,
            kept=[Block(text=excerpt, score=best.score, index=best.index)],
            kept_count=1,
            total=len(blocks),
        )

    kept.sort(key=lambda b: b.index)

    return Selection(
        text="\n\n".join(b.text for b in kept), kept=kept, kept_count=len(kept), total=len(blocks)
    )
