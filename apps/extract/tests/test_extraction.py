"""Tests for HTML extraction and markdown serialisation."""

from __future__ import annotations

from helix_extract.extraction import content_hash, extract

ARTICLE = """
<html><head><title>The Real Title</title></head>
<body>
  <nav><a href="/home">Home</a><a href="/about">About</a></nav>
  <header><h1>Site name</h1></header>
  <article>
    <h1>An Article About Something</h1>
    <p>The first paragraph carries the substance of the piece and runs long
       enough that no length heuristic mistakes it for boilerplate text.</p>
    <p>A second paragraph continues the argument, with <a href="/more">a link</a>
       and some <strong>emphasis</strong> along the way.</p>
    <ul><li>First point</li><li>Second point</li></ul>
  </article>
  <footer><p>Copyright 2026</p></footer>
</body></html>
"""


class TestExtract:
    def test_pulls_the_main_content_out_of_an_article(self) -> None:
        result = extract(ARTICLE, "https://example.com/post")

        assert "An Article About Something" in result.markdown
        assert "first paragraph carries the substance" in result.markdown
        assert result.extractor_used.startswith("trafilatura")

    def test_drops_navigation_and_footer_furniture(self) -> None:
        result = extract(ARTICLE, "https://example.com/post", only_main_content=True)

        # Chrome around the content is exactly what onlyMainContent exists to remove.
        assert "Copyright 2026" not in result.markdown
        assert "Site name" not in result.markdown

    def test_resolves_links_against_the_page_url(self) -> None:
        result = extract(ARTICLE, "https://example.com/post")

        assert "https://example.com/more" in result.links
        # Relative hrefs must not survive as relative.
        assert not any(link.startswith("/") for link in result.links)

    def test_ignores_non_navigational_hrefs(self) -> None:
        html = """<html><body><article><p>Body text long enough to be kept by the
        extractor rather than discarded as boilerplate content.</p>
        <a href="#section">anchor</a><a href="mailto:a@b.com">mail</a>
        <a href="javascript:void(0)">js</a><a href="/real">real</a>
        </article></body></html>"""

        result = extract(html, "https://example.com/")

        assert result.links == ["https://example.com/real"]

    def test_strips_fragments_so_one_page_is_one_link(self) -> None:
        html = """<html><body><article><p>Body text long enough to be kept by the
        extractor rather than discarded as boilerplate content.</p>
        <a href="/doc#one">one</a><a href="/doc#two">two</a>
        </article></body></html>"""

        result = extract(html, "https://example.com/")

        assert result.links == ["https://example.com/doc"]

    def test_falls_back_to_the_whole_document_rather_than_returning_nothing(self) -> None:
        # A page with no recognisable article region should still yield its text.
        # Returning empty here is the worse failure.
        html = """<html><body><div>Some text that is not wrapped in any semantic
        article element at all, but is still the entire point of the page and
        must not be silently discarded by an over-eager extractor.</div></body></html>"""

        result = extract(html, "https://example.com/")

        assert len(result.text) > 50

    def test_excludes_selectors_before_extraction(self) -> None:
        result = extract(
            ARTICLE,
            "https://example.com/post",
            exclude_selectors=["ul"],
        )

        assert "First point" not in result.markdown
        assert "first paragraph carries" in result.markdown

    def test_includes_only_the_requested_region(self) -> None:
        result = extract(
            ARTICLE,
            "https://example.com/post",
            include_selectors=["footer"],
            only_main_content=False,
        )

        assert "Copyright 2026" in result.markdown
        assert "An Article About Something" not in result.markdown

    def test_auto_recovers_when_the_precise_engine_finds_little(self) -> None:
        # trafilatura favours precision and can strip an unusual layout to
        # nothing; `auto` exists to notice that and try the other engine.
        awkward = """<html><body><div id="content"><div><span>Text held in nested
        spans without any semantic markup whatsoever, which precision-oriented
        extraction can discard entirely even though it is the whole page.</span>
        </div></div></body></html>"""

        result = extract(awkward, "https://example.com/", extractor="auto")

        assert len(result.text) > 50


class TestContentHash:
    def test_is_stable_for_identical_text(self) -> None:
        assert content_hash("hello world") == content_hash("hello world")

    def test_ignores_whitespace_and_case_churn(self) -> None:
        # Reformatting is not a content change. If it hashed differently, every
        # incremental crawl would re-fetch pages that had not actually moved.
        assert content_hash("hello   world") == content_hash("hello world")
        assert content_hash("Hello World") == content_hash("hello world")
        assert content_hash("hello\n\nworld") == content_hash("hello world")

    def test_differs_when_the_text_differs(self) -> None:
        assert content_hash("hello world") != content_hash("hello there")

    def test_returns_a_sha256_digest(self) -> None:
        digest = content_hash("anything")
        assert len(digest) == 64
        assert all(c in "0123456789abcdef" for c in digest)
