"""HTML extraction and markdown serialisation.

Two engines behind one interface:

- **trafilatura** leads on F1 across independent benchmarks (0.924 on its own
  evaluation, 0.937 mean and 0.978 precision in Sandia SAND2024-10208). It is
  precise, and errs toward leaving borderline content out.
- **readability** has the best recall (0.929) and errs the other way, including
  more than it should.

`auto` picks between them on what the page turns out to be, rather than trusting
either to be right everywhere.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import trafilatura
from lxml import html as lxml_html
from readability import Document

# Below this, an extraction is treated as having found nothing worth keeping.
MIN_USEFUL_CHARS = 200


@dataclass
class Extracted:
    markdown: str
    text: str
    title: str | None = None
    language: str | None = None
    links: list[str] = field(default_factory=list)
    extractor_used: str = "trafilatura"
    content_hash: str = ""


def content_hash(text: str) -> str:
    """Hash of normalised text.

    Whitespace is collapsed before hashing so that reformatting, minification
    changes and inconsistent indentation do not read as content changes. This
    hash drives incremental crawl and change detection, so a page that says the
    same thing must hash the same way.
    """
    normalised = re.sub(r"\s+", " ", text).strip().lower()
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def _extract_links(doc_html: str, base_url: str) -> list[str]:
    try:
        tree = lxml_html.fromstring(doc_html)
    except Exception:
        return []

    base_host = urlparse(base_url).netloc
    seen: dict[str, None] = {}

    for anchor in tree.xpath("//a[@href]"):
        href = anchor.get("href", "").strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
            continue
        try:
            absolute = urljoin(base_url, href)
        except ValueError:
            continue
        if not absolute.startswith(("http://", "https://")):
            continue
        # Fragments point at the same document, so they are not separate links.
        absolute = absolute.split("#", 1)[0]
        if absolute and absolute not in seen:
            seen[absolute] = None

    _ = base_host
    return list(seen)


def _apply_selectors(
    doc_html: str, include: list[str], exclude: list[str]
) -> str:
    """Narrow or prune the document before extraction.

    Selector work happens first so the extractor sees only what the caller
    wants; running it afterwards would mean scoring content that is about to be
    discarded.
    """
    if not include and not exclude:
        return doc_html

    try:
        tree = lxml_html.fromstring(doc_html)
    except Exception:
        return doc_html

    if include:
        kept = []
        for selector in include:
            try:
                kept.extend(tree.cssselect(selector))
            except Exception:
                continue
        if kept:
            # Rebuild a full document rather than handing back a bare fragment:
            # extractors reject a rootless tree as invalid HTML and return
            # nothing, which reads as "the selector matched no content".
            #
            # The kept region is re-parented into <article> because boilerplate
            # detection classifies by element type — a <footer> or <nav> the
            # caller explicitly asked for would otherwise be stripped as chrome.
            # An explicit selector is a statement of intent that outranks the
            # extractor's guess about what matters on the page.
            document = lxml_html.Element("html")
            body = lxml_html.Element("body")
            article = lxml_html.Element("article")
            document.append(body)
            body.append(article)

            for element in kept:
                # Unwrap chrome tags — <footer>, <nav>, <aside> — and keep their
                # children. Boilerplate detection classifies by element type, so
                # a footer the caller explicitly selected would still be stripped
                # even nested inside <article>.
                if element.tag in ("footer", "nav", "aside", "header"):
                    if element.text and element.text.strip():
                        holder = lxml_html.Element("p")
                        holder.text = element.text
                        article.append(holder)
                    for child in list(element):
                        article.append(child)
                else:
                    article.append(element)

            tree = document

    for selector in exclude:
        try:
            for element in tree.cssselect(selector):
                parent = element.getparent()
                if parent is not None:
                    parent.remove(element)
        except Exception:
            continue

    return lxml_html.tostring(tree, encoding="unicode")


def _trafilatura_extract(doc_html: str, url: str, only_main: bool) -> tuple[str, str | None]:
    markdown = trafilatura.extract(
        doc_html,
        url=url,
        output_format="markdown",
        include_links=True,
        include_tables=True,
        include_formatting=True,
        favor_precision=only_main,
        favor_recall=not only_main,
    )
    if not markdown:
        return "", None

    metadata = trafilatura.extract_metadata(doc_html)
    title = metadata.title if metadata else None
    return markdown, title


def _readability_extract(doc_html: str, url: str) -> tuple[str, str | None]:
    doc = Document(doc_html)
    summary_html = doc.summary(html_partial=True)
    title = doc.short_title() or None

    # readability returns HTML, so convert it through trafilatura rather than
    # writing a second, differently-behaved markdown serialiser.
    markdown = trafilatura.extract(
        summary_html,
        url=url,
        output_format="markdown",
        include_links=True,
        include_tables=True,
        include_formatting=True,
    )
    return markdown or "", title


def _to_text(markdown: str) -> str:
    """Plain text from markdown, for hashing and length checks."""
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", markdown)  # links and images
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)  # headings
    text = re.sub(r"[*_`>]", "", text)  # emphasis, code, quotes
    text = re.sub(r"^\s*[-–—|]+\s*$", "", text, flags=re.MULTILINE)  # rules
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract(
    doc_html: str,
    url: str,
    extractor: str = "trafilatura",
    only_main_content: bool = True,
    include_selectors: list[str] | None = None,
    exclude_selectors: list[str] | None = None,
) -> Extracted:
    prepared = _apply_selectors(doc_html, include_selectors or [], exclude_selectors or [])

    markdown = ""
    title: str | None = None
    used = extractor

    if extractor in ("trafilatura", "auto"):
        markdown, title = _trafilatura_extract(prepared, url, only_main_content)
        used = "trafilatura"

    # `auto` means: if the precise engine found little, try the one that
    # over-includes. A short page and an over-stripped page look identical from
    # here, and returning nothing is the worse error.
    if extractor == "auto" and len(_to_text(markdown)) < MIN_USEFUL_CHARS:
        fallback_markdown, fallback_title = _readability_extract(prepared, url)
        if len(_to_text(fallback_markdown)) > len(_to_text(markdown)):
            markdown, title, used = fallback_markdown, fallback_title or title, "readability"

    if extractor == "readability":
        markdown, title = _readability_extract(prepared, url)
        used = "readability"

    # Last resort: extract from the whole document rather than the main-content
    # region. A nav-heavy page is worth more than an empty response.
    if not markdown.strip() and only_main_content:
        markdown, retry_title = _trafilatura_extract(prepared, url, only_main=False)
        title = title or retry_title
        if markdown:
            used = f"{used}+whole-document"

    text = _to_text(markdown)

    metadata = trafilatura.extract_metadata(doc_html)
    language = None
    if metadata is not None:
        title = title or metadata.title
        language = getattr(metadata, "language", None)

    return Extracted(
        markdown=markdown,
        text=text,
        title=title,
        language=language,
        links=_extract_links(doc_html, url),
        extractor_used=used,
        content_hash=content_hash(text),
    )
