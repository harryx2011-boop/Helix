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

THE SCORE IS ATTACKER-STEERABLE, AND THE LEAD RESERVE IS WHAT BOUNDS IT.
The page is written by whoever controls the site; the schema vocabulary it is
scored against travels to that page in the request. So a block that simply
repeats the field names outscores the block holding the real answer — measured
2026-08-28 at 3.50 against 1.15 for a genuine product line — and sixty such
blocks take every slot: at a 400-token budget, 17 of 17 kept blocks were the
attacker's and the true value was not in the payload at all. The trimmer built
to save tokens was selecting FOR the payload.

Ranking cannot be fixed by reweighting, because any lexical signal the schema
can express is a signal the page can echo. What it can be bounded by is
position: LEAD_RESERVE_FRACTION of the budget always goes to the document's
opening blocks in document order, whatever they score. Titles, summaries and
lead paragraphs live there, an injection block placed there has to displace the
page's own visible content to reach the model, and the reserve is spent on real
content rather than held back when a page is benign.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

CHARS_PER_TOKEN = 4

LEAD_RESERVE_FRACTION = 0.25

TOP_BAND_MAX_FRACTION = 0.5

TOP_BAND_RATIO = 0.6

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
    kept: list[Block]
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

    The score is deliberately left uncapped here. Reweighting it was tried and
    abandoned on 2026-08-28: any lexical signal the schema can express is one
    the page can echo, so every reweighting moved the numbers without
    separating the two populations. What DOES separate them is measured and
    stable — real content scores 0.56 to 1.44 across every shape a product page
    states an answer in, while text salted with the schema's vocabulary scores
    2.6 and up — and `select` acts on that with a band cap rather than trying
    to out-score the attacker here.
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

    if all(block.score == 0 for block in scored):
        kept: list[Block] = []
        used = 0
        for block in scored:
            if used + len(block.text) > budget_chars:
                break
            kept.append(block)
            used += len(block.text) + 2

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
    taken: set[int] = set()

    lead_budget = int(budget_chars * LEAD_RESERVE_FRACTION)
    for block in scored:
        cost = len(block.text) + 2
        if used + cost > lead_budget:
            break
        kept.append(block)
        taken.add(block.index)
        used += cost

    top_score = ranked[0].score
    band_floor = top_score * TOP_BAND_RATIO
    band_budget = int(budget_chars * TOP_BAND_MAX_FRACTION)
    band_used = 0

    for block in ranked:
        if block.index in taken:
            continue
        cost = len(block.text) + 2
        if used + cost > budget_chars:
            continue
        in_band = block.score >= band_floor
        if in_band and band_used + cost > band_budget:
            continue
        kept.append(block)
        taken.add(block.index)
        used += cost
        if in_band:
            band_used += cost

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
