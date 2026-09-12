"""Tests for semantic chunking and anchor stability."""

from __future__ import annotations

from fastapi.testclient import TestClient

from helix_extract.chunking import chunk_markdown, make_anchor
from helix_extract.main import app

client = TestClient(app)

DOC = """# Getting Started

Welcome to the documentation. This introduction explains what the product does
and who it is for.

## Installation

Run the installer and follow the prompts. It takes about a minute on a normal
connection.

## Pricing

The Pro plan costs $29 per month. The Team plan costs $99 per month.

### Discounts

Annual billing saves twenty percent.
"""


class TestAnchors:
    def test_is_stable_for_the_same_content(self) -> None:
        a = make_anchor("https://e.com/docs", ["Pricing"], "The Pro plan costs $29.")
        b = make_anchor("https://e.com/docs", ["Pricing"], "The Pro plan costs $29.")
        assert a == b

    def test_survives_an_edit_further_down_the_chunk(self) -> None:
        # Anchors hash the opening only, so appending to a section does not
        # break every citation that pointed into it.
        opening = "The Pro plan costs $29 per month and includes everything in Starter. "
        a = make_anchor("https://e.com/d", ["Pricing"], opening + "Original tail.")
        b = make_anchor("https://e.com/d", ["Pricing"], opening + "A rewritten tail entirely.")
        assert a == b

    def test_does_not_encode_position(self) -> None:
        # An anchor containing "chunk 7" breaks when chunk 3 is edited. Two
        # identical sections at different positions must anchor identically.
        text = "Identical section content here."
        assert make_anchor("https://e.com/d", ["A"], text) == make_anchor(
            "https://e.com/d", ["A"], text
        )

    def test_separates_different_sections(self) -> None:
        a = make_anchor("https://e.com/d", ["Pricing"], "text")
        b = make_anchor("https://e.com/d", ["Features"], "text")
        assert a != b

    def test_includes_a_readable_heading_slug(self) -> None:
        anchor = make_anchor("https://e.com/d", ["Getting Started", "Installation"], "text")
        assert "getting-started/installation" in anchor

    def test_changes_when_the_content_changes(self) -> None:
        a = make_anchor("https://e.com/d", ["P"], "The price is $29.")
        b = make_anchor("https://e.com/d", ["P"], "The price is $39.")
        assert a != b


class TestChunkMarkdown:
    def test_splits_a_document_by_section(self) -> None:
        chunks = chunk_markdown(DOC, "https://e.com/docs", strategy="heading")

        assert len(chunks) >= 3
        assert any("Installation" in c.text for c in chunks)
        assert any("$29" in c.text for c in chunks)

    def test_carries_the_heading_into_each_chunk(self) -> None:
        # A chunk saying "it costs $29" is useless without the heading that
        # says what "it" is — the context is what makes it retrievable.
        chunks = chunk_markdown(DOC, "https://e.com/docs", strategy="heading")
        pricing = next(c for c in chunks if "$29" in c.text)

        assert "Pricing" in pricing.text
        assert "Pricing" in pricing.heading_path

    def test_nests_a_deeper_heading_under_its_parent(self) -> None:
        chunks = chunk_markdown(DOC, "https://e.com/docs", strategy="heading")
        discounts = next(c for c in chunks if "twenty percent" in c.text)

        assert discounts.heading_path == ["Getting Started", "Pricing", "Discounts"]

    def test_resets_the_path_for_a_shallower_heading(self) -> None:
        doc = "# One\n\nBody one.\n\n## Sub\n\nBody sub.\n\n# Two\n\nBody two."
        chunks = chunk_markdown(doc, "https://e.com/d", strategy="heading")

        two = next(c for c in chunks if "Body two" in c.text)
        assert two.heading_path == ["Two"]

    def test_splits_a_long_section_on_sentence_boundaries(self) -> None:
        # A chunk cut mid-sentence embeds badly and reads as incoherent to
        # whoever eventually sees the citation.
        long_section = "# Long\n\n" + "This is a complete sentence about the topic. " * 200
        chunks = chunk_markdown(long_section, "https://e.com/d", max_tokens=100)

        assert len(chunks) > 1
        bodies = [c.text.split("\n\n", 1)[-1].strip() for c in chunks]
        assert sum(1 for b in bodies if b.endswith(".")) >= len(bodies) - 1

    def test_overlaps_chunks_so_a_boundary_fact_stays_findable(self) -> None:
        text = "# S\n\n" + " ".join(f"Sentence number {i} of the section." for i in range(200))
        chunks = chunk_markdown(text, "https://e.com/d", max_tokens=100, overlap=32)

        assert len(chunks) > 1
        first_words = set(chunks[0].text.split())
        second_words = set(chunks[1].text.split())
        assert first_words & second_words

    def test_respects_the_token_budget(self) -> None:
        text = "# S\n\n" + "Word " * 5_000
        chunks = chunk_markdown(text, "https://e.com/d", max_tokens=128)

        # Four characters per token, plus slack for the heading prefix.
        assert all(len(c.text) <= 128 * 4 + 200 for c in chunks)

    def test_fixed_strategy_ignores_structure(self) -> None:
        chunks = chunk_markdown(DOC, "https://e.com/d", strategy="fixed", max_tokens=50)

        assert len(chunks) > 1
        assert all(c.heading_path == [] for c in chunks)

    def test_returns_nothing_for_empty_input(self) -> None:
        assert chunk_markdown("", "https://e.com/d") == []
        assert chunk_markdown("   \n\n  ", "https://e.com/d") == []

    def test_handles_a_document_with_no_headings(self) -> None:
        chunks = chunk_markdown("Just a plain paragraph of text.", "https://e.com/d")

        assert len(chunks) == 1
        assert chunks[0].heading_path == []

    def test_numbers_chunks_in_document_order(self) -> None:
        chunks = chunk_markdown(DOC, "https://e.com/docs", strategy="heading")
        assert [c.index for c in chunks] == list(range(len(chunks)))

    def test_overlap_larger_than_max_tokens_stays_within_budget(self) -> None:
        # An overlap at or beyond the chunk budget re-carries the whole chunk
        # forward every time, so each new chunk only grows: nothing is ever
        # dropped and the token budget stops meaning anything. Clamped, every
        # chunk stays near the same small size instead of climbing linearly.
        text = "Sentence one here. " * 100
        chunks = chunk_markdown(text, "https://e.com/d", max_tokens=5, overlap=1000)

        lens = [len(c.text) for c in chunks]
        assert max(lens) - min(lens) < 20

    def test_overlap_zero_still_works(self) -> None:
        text = "# S\n\n" + " ".join(f"Sentence number {i} of the section." for i in range(200))
        chunks = chunk_markdown(text, "https://e.com/d", max_tokens=100, overlap=0)

        assert len(chunks) > 1
        texts = [c.text for c in chunks]
        assert len(texts) == len(set(texts))


class TestChunkEndpointValidation:
    def test_rejects_overlap_equal_to_max_tokens(self) -> None:
        response = client.post(
            "/chunk",
            json={"text": "hello world", "url": "https://e.com/d", "max_tokens": 10, "overlap": 10},
        )
        assert response.status_code == 422

    def test_rejects_overlap_greater_than_max_tokens(self) -> None:
        response = client.post(
            "/chunk",
            json={"text": "hello world", "url": "https://e.com/d", "max_tokens": 5, "overlap": 1000},
        )
        assert response.status_code == 422

    def test_rejects_a_non_positive_max_tokens(self) -> None:
        response = client.post(
            "/chunk",
            json={"text": "hello world", "url": "https://e.com/d", "max_tokens": 0, "overlap": 0},
        )
        assert response.status_code == 422

    def test_rejects_a_negative_overlap(self) -> None:
        response = client.post(
            "/chunk",
            json={"text": "hello world", "url": "https://e.com/d", "max_tokens": 10, "overlap": -1},
        )
        assert response.status_code == 422

    def test_accepts_overlap_one_less_than_max_tokens(self) -> None:
        response = client.post(
            "/chunk",
            json={"text": "hello world", "url": "https://e.com/d", "max_tokens": 10, "overlap": 9},
        )
        assert response.status_code == 200

    def test_accepts_zero_overlap(self) -> None:
        response = client.post(
            "/chunk",
            json={"text": "hello world", "url": "https://e.com/d", "max_tokens": 10, "overlap": 0},
        )
        assert response.status_code == 200
