"""Tests for relevance scoring and trimming."""

from __future__ import annotations

from helix_extract.relevance import schema_terms, score_block, split_blocks, trim_to_budget

PRICING_SCHEMA = {
    "type": "object",
    "properties": {
        "monthlyPrice": {"type": "number", "description": "Cost per month in dollars"},
        "planName": {"type": "string"},
    },
}


class TestSchemaTerms:
    def test_splits_camel_case_field_names(self) -> None:
        # A schema asking for `monthlyPrice` should match text saying "monthly"
        # and "price"; without the split it matches neither.
        terms = schema_terms({"type": "object", "properties": {"monthlyPrice": {}}})

        assert "monthly" in terms
        assert "price" in terms

    def test_includes_descriptions_and_examples(self) -> None:
        terms = schema_terms(
            {
                "type": "object",
                "properties": {
                    "x": {"description": "the funding round", "examples": ["Series B"]}
                },
            }
        )

        assert "funding" in terms
        assert "series" in terms

    def test_excludes_stopwords(self) -> None:
        terms = schema_terms({"type": "object", "properties": {"x": {"description": "the and of"}}})
        assert terms == set()

    def test_includes_prompt_vocabulary(self) -> None:
        terms = schema_terms({}, prompt="find the headquarters location")
        assert "headquarters" in terms


class TestSplitBlocks:
    def test_splits_on_blank_lines(self) -> None:
        assert len(split_blocks("First paragraph.\n\nSecond paragraph.")) == 2

    def test_keeps_a_heading_with_its_section(self) -> None:
        # A heading alone scores poorly and carries the context its section
        # needs, so detaching it loses the signal that makes the section findable.
        blocks = split_blocks("# Pricing\n\nOur plans start at $10 per month.")

        assert len(blocks) == 1
        assert "# Pricing" in blocks[0]
        assert "$10" in blocks[0]

    def test_keeps_a_trailing_heading(self) -> None:
        blocks = split_blocks("Body text here.\n\n# Orphan Heading")
        assert any("Orphan Heading" in b for b in blocks)


class TestScoreBlock:
    def test_scores_a_relevant_block_above_an_irrelevant_one(self) -> None:
        wanted = schema_terms(PRICING_SCHEMA)

        relevant = score_block("Our monthly price is $29 for the Pro plan.", wanted)
        irrelevant = score_block("We were founded in Berlin by two engineers.", wanted)

        assert relevant > irrelevant

    def test_does_not_reward_mere_repetition(self) -> None:
        # A block saying "price" ten times is not ten times more relevant.
        wanted = schema_terms(PRICING_SCHEMA)

        once = score_block("The monthly price of the plan.", wanted)
        repeated = score_block("price " * 40, wanted)

        assert once > repeated

    def test_returns_zero_when_nothing_is_wanted(self) -> None:
        assert score_block("Any text at all.", set()) == 0.0


class TestTrimToBudget:
    def test_leaves_short_content_untouched(self) -> None:
        content = "A short page."
        trimmed, kept, total = trim_to_budget(content, PRICING_SCHEMA, max_tokens=1000)

        assert trimmed == content
        assert kept == 0 and total == 0

    def test_keeps_the_relevant_section_and_drops_the_rest(self) -> None:
        noise = "\n\n".join(f"Paragraph {i} about company history and culture." * 8 for i in range(60))
        signal = "# Pricing\n\nThe monthly price for the Pro plan is $29 per month."
        content = f"{noise}\n\n{signal}\n\n{noise}"

        trimmed, kept, total = trim_to_budget(content, PRICING_SCHEMA, max_tokens=200)

        assert "monthly price" in trimmed
        assert kept < total
        assert len(trimmed) < len(content)

    def test_preserves_document_order(self) -> None:
        # A document reordered by score reads as nonsense, and models do worse
        # on it than on a coherent excerpt.
        blocks = [
            "# Intro\n\nWelcome to our company page.",
            "# Pricing\n\nThe monthly price is $29.",
            "# Plans\n\nThe Pro plan includes everything.",
            "# Careers\n\nWe are hiring engineers in Berlin.",
        ]
        content = "\n\n".join(b + " padding text. " * 60 for b in blocks)

        trimmed, _, _ = trim_to_budget(content, PRICING_SCHEMA, max_tokens=150)

        if "monthly price" in trimmed and "Pro plan" in trimmed:
            assert trimmed.index("monthly price") < trimmed.index("Pro plan")

    def test_falls_back_to_the_opening_when_nothing_matches(self) -> None:
        # With no signal, the start of a document is the best guess: titles,
        # summaries and lead paragraphs live there.
        content = "\n\n".join(f"Block {i} of entirely unrelated prose content." * 20 for i in range(50))

        trimmed, kept, total = trim_to_budget(content, PRICING_SCHEMA, max_tokens=100)

        assert "Block 0" in trimmed
        assert kept > 0 and kept < total

    def test_never_returns_nothing_when_one_block_exceeds_the_budget(self) -> None:
        # A single enormous paragraph must not trim to an empty string — empty
        # output reads as "this page had no content", which is a worse answer
        # than a truncated excerpt.
        content = "One enormous unbroken paragraph. " * 2_000

        trimmed, kept, _ = trim_to_budget(content, PRICING_SCHEMA, max_tokens=100)

        assert trimmed
        assert kept == 1

    def test_never_returns_nothing_when_a_relevant_block_exceeds_the_budget(self) -> None:
        content = "The monthly price of the Pro plan is $29. " * 2_000

        trimmed, kept, _ = trim_to_budget(content, PRICING_SCHEMA, max_tokens=100)

        assert trimmed
        assert kept == 1

    def test_respects_the_budget(self) -> None:
        content = "\n\n".join(f"Paragraph {i} mentioning price and monthly plans." * 10 for i in range(100))

        trimmed, _, _ = trim_to_budget(content, PRICING_SCHEMA, max_tokens=500)

        # 500 tokens at ~4 chars each, with a little slack for block joins.
        assert len(trimmed) <= 500 * 4 + 100
