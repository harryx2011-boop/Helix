"""Document parsing — PDF, DOCX, PPTX, XLSX.

Documents share the scrape API with web pages. A RAG pipeline over both
currently needs two vendors with two pricing models; there is no good reason for
that to be true.

**Classify before parsing.** A scanned PDF has no usable text layer, and pulling
one out anyway yields mojibake that looks like content and poisons everything
downstream. This is the failure that produces garbled CJK output in tools that
skip the step — so the pipeline detects it and routes to OCR instead.

Parser selection, cheapest first:

- **pypdfium2** (Apache/BSD) for clean text layers. Chosen over the faster
  PyMuPDF, whose AGPL licence would contaminate a permissively-licensed project.
- **Marker** for scanned or garbled documents. Apache-2.0, matches a frontier
  VLM on olmocr-bench at roughly five times MinerU's throughput.
- **Docling** when table fidelity matters. Leads on tables at 97.9% despite a
  lower general score — different tools genuinely win different sub-tasks.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum

# Below this ratio of extractable characters per page, a PDF is treated as
# scanned regardless of what the text layer claims to contain.
MIN_CHARS_PER_PAGE = 50

# Above this proportion of replacement/control/private-use characters, a text
# layer has decoded wrongly even though it produced output.
GARBLED_THRESHOLD = 0.10


class DocumentKind(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    PPTX = "pptx"
    XLSX = "xlsx"
    UNKNOWN = "unknown"


CONTENT_TYPES: dict[str, DocumentKind] = {
    "application/pdf": DocumentKind.PDF,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocumentKind.DOCX,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": DocumentKind.PPTX,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": DocumentKind.XLSX,
    "application/msword": DocumentKind.DOCX,
    "application/vnd.ms-excel": DocumentKind.XLSX,
    "application/vnd.ms-powerpoint": DocumentKind.PPTX,
}


def classify_content_type(content_type: str) -> DocumentKind:
    base = content_type.split(";", 1)[0].strip().lower()
    return CONTENT_TYPES.get(base, DocumentKind.UNKNOWN)


def available_parsers() -> list[str]:
    """Which parsers this deployment can actually reach.

    Marker and Docling live in the `documents` extra, so a base install has
    neither. Reporting that honestly beats accepting a request that will quietly
    fall back to an empty answer.
    """
    parsers = ["pypdfium2", "python-docx", "python-pptx", "openpyxl"]

    try:
        import marker  # type: ignore[import-not-found]  # noqa: F401

        parsers.append("marker")
    except ImportError:
        pass

    try:
        import docling  # type: ignore[import-not-found]  # noqa: F401

        parsers.append("docling")
    except ImportError:
        pass

    return parsers


@dataclass
class PdfAssessment:
    """What a PDF's text layer is actually worth."""

    pages: int
    chars_extracted: int
    needs_ocr: bool
    suspected_garbled_text: bool
    reason: str


def looks_garbled(text: str) -> bool:
    """Detect a text layer that decoded to nonsense.

    A broken CMap or a subsetted font with no ToUnicode table still yields
    characters — they are simply the wrong ones. Length checks pass, so the only
    way to catch this is to look at what the characters are.
    """
    if not text:
        return False

    sample = text[:20_000]
    suspicious = 0
    considered = 0

    for char in sample:
        if char.isspace():
            continue
        considered += 1

        if char == "�":  # replacement character
            suspicious += 1
            continue

        category = unicodedata.category(char)
        # Co = private use, Cn = unassigned, Cc = control (excluding whitespace).
        if category in ("Co", "Cn", "Cc"):
            suspicious += 1

    if considered == 0:
        return False

    if suspicious / considered > GARBLED_THRESHOLD:
        return True

    # A text layer that produced almost no word-like runs is also suspect: real
    # prose has vowels and spaces, mojibake frequently has neither.
    words = re.findall(r"[^\W\d_]{2,}", sample)
    if considered > 200 and len(words) < considered / 50:
        return True

    return False


def assess_pdf(data: bytes) -> PdfAssessment:
    """Decide whether a PDF's text layer can be trusted.

    Runs before any parsing so the choice of parser is made on evidence rather
    than on hope.
    """
    try:
        import pypdfium2 as pdfium
    except ImportError:  # pragma: no cover - dependency is declared
        return PdfAssessment(
            pages=0,
            chars_extracted=0,
            needs_ocr=True,
            suspected_garbled_text=False,
            reason="pypdfium2 unavailable; cannot inspect the text layer",
        )

    try:
        document = pdfium.PdfDocument(data)
    except Exception as exc:
        return PdfAssessment(
            pages=0,
            chars_extracted=0,
            needs_ocr=True,
            suspected_garbled_text=False,
            reason=f"could not open the PDF: {exc}",
        )

    try:
        pages = len(document)
        if pages == 0:
            return PdfAssessment(0, 0, True, False, "the PDF has no pages")

        # Sample rather than read everything: a hundred-page report does not
        # need full extraction to reveal whether it has a text layer.
        sample_indices = list(range(min(pages, 5)))
        collected: list[str] = []

        for index in sample_indices:
            page = document[index]
            textpage = page.get_textpage()
            collected.append(textpage.get_text_range())

        sampled_text = "\n".join(collected)
        chars = len(sampled_text.strip())
        per_page = chars / len(sample_indices)

        garbled = looks_garbled(sampled_text)

        if garbled:
            return PdfAssessment(
                pages=pages,
                chars_extracted=chars,
                needs_ocr=True,
                suspected_garbled_text=True,
                reason="the text layer decoded to unreadable characters",
            )

        if per_page < MIN_CHARS_PER_PAGE:
            return PdfAssessment(
                pages=pages,
                chars_extracted=chars,
                needs_ocr=True,
                suspected_garbled_text=False,
                reason=f"only {per_page:.0f} characters per page; likely scanned",
            )

        return PdfAssessment(
            pages=pages,
            chars_extracted=chars,
            needs_ocr=False,
            suspected_garbled_text=False,
            reason="the text layer is usable",
        )
    finally:
        document.close()


@dataclass
class ParsedDocument:
    markdown: str
    pages: int
    needs_ocr: bool
    ocr_applied: bool
    suspected_garbled_text: bool
    parser_used: str


def _pdf_to_markdown(data: bytes, max_pages: int | None = None) -> tuple[str, int]:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(data)
    try:
        total = len(document)
        limit = min(total, max_pages) if max_pages else total

        parts: list[str] = []
        for index in range(limit):
            page = document[index]
            text = page.get_textpage().get_text_range().strip()
            if text:
                # Page markers keep a citation locatable in the source document.
                parts.append(f"<!-- page {index + 1} -->\n\n{text}")

        return "\n\n".join(parts), total
    finally:
        document.close()


def _docx_to_markdown(data: bytes) -> str:
    import io

    from docx import Document as DocxDocument

    document = DocxDocument(io.BytesIO(data))
    lines: list[str] = []

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        style = (paragraph.style.name or "").lower()
        if style.startswith("heading"):
            level = "".join(c for c in style if c.isdigit()) or "1"
            lines.append(f"{'#' * min(int(level), 6)} {text}")
        else:
            lines.append(text)

    for table in document.tables:
        rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
        if not rows:
            continue
        header, *body = rows
        lines.append("")
        lines.append("| " + " | ".join(header) + " |")
        lines.append("| " + " | ".join("---" for _ in header) + " |")
        for row in body:
            lines.append("| " + " | ".join(row) + " |")

    return "\n\n".join(lines)


def _pptx_to_markdown(data: bytes) -> tuple[str, int]:
    import io

    from pptx import Presentation

    presentation = Presentation(io.BytesIO(data))
    parts: list[str] = []

    for index, slide in enumerate(presentation.slides, start=1):
        texts = [
            shape.text.strip()
            for shape in slide.shapes
            if getattr(shape, "has_text_frame", False) and shape.text.strip()
        ]
        if texts:
            parts.append(f"## Slide {index}\n\n" + "\n\n".join(texts))

    return "\n\n".join(parts), len(presentation.slides)


def _xlsx_to_markdown(data: bytes, max_rows: int = 1000) -> str:
    import io

    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    parts: list[str] = []

    for sheet in workbook.worksheets:
        rows = []
        for row in sheet.iter_rows(max_row=max_rows, values_only=True):
            if row and any(cell is not None for cell in row):
                rows.append(["" if cell is None else str(cell) for cell in row])

        if not rows:
            continue

        header, *body = rows
        width = len(header)
        parts.append(f"## {sheet.title}")
        parts.append("| " + " | ".join(header) + " |")
        parts.append("| " + " | ".join("---" for _ in range(width)) + " |")
        for row in body:
            padded = (row + [""] * width)[:width]
            parts.append("| " + " | ".join(padded) + " |")
        parts.append("")

    workbook.close()
    return "\n".join(parts)


def parse(
    data: bytes,
    content_type: str,
    ocr: str = "auto",
    max_pages: int | None = None,
    tables: str = "auto",
) -> ParsedDocument:
    """Parse a document, choosing a parser from what the file turns out to be."""
    kind = classify_content_type(content_type)

    if kind is DocumentKind.DOCX:
        return ParsedDocument(
            markdown=_docx_to_markdown(data),
            pages=0,
            needs_ocr=False,
            ocr_applied=False,
            suspected_garbled_text=False,
            parser_used="python-docx",
        )

    if kind is DocumentKind.PPTX:
        markdown, slides = _pptx_to_markdown(data)
        return ParsedDocument(
            markdown=markdown,
            pages=slides,
            needs_ocr=False,
            ocr_applied=False,
            suspected_garbled_text=False,
            parser_used="python-pptx",
        )

    if kind is DocumentKind.XLSX:
        return ParsedDocument(
            markdown=_xlsx_to_markdown(data),
            pages=0,
            needs_ocr=False,
            ocr_applied=False,
            suspected_garbled_text=False,
            parser_used="openpyxl",
        )

    if kind is not DocumentKind.PDF:
        raise ValueError(f"unsupported content type: {content_type}")

    assessment = assess_pdf(data)

    # `never` means the caller accepts a degraded answer over an expensive one,
    # but the flags still report what was found so the result is not mistaken
    # for clean text.
    should_ocr = ocr == "always" or (ocr == "auto" and assessment.needs_ocr)

    if should_ocr:
        markdown, parser = _ocr_pdf(data, max_pages)
        return ParsedDocument(
            markdown=markdown,
            pages=assessment.pages,
            needs_ocr=assessment.needs_ocr,
            ocr_applied=parser != "none",
            suspected_garbled_text=assessment.suspected_garbled_text,
            parser_used=parser,
        )

    if tables == "high-fidelity":
        markdown, parser = _docling_pdf(data)
        if parser != "none":
            return ParsedDocument(
                markdown=markdown,
                pages=assessment.pages,
                needs_ocr=False,
                ocr_applied=False,
                suspected_garbled_text=False,
                parser_used=parser,
            )

    markdown, pages = _pdf_to_markdown(data, max_pages)
    return ParsedDocument(
        markdown=markdown,
        pages=pages,
        needs_ocr=assessment.needs_ocr,
        ocr_applied=False,
        suspected_garbled_text=assessment.suspected_garbled_text,
        parser_used="pypdfium2",
    )


def _ocr_pdf(data: bytes, max_pages: int | None) -> tuple[str, str]:
    """OCR a scanned PDF with Marker, if it is installed.

    Marker lives in the `documents` extra because it pulls ML models that most
    deployments do not need. When it is absent, say so plainly rather than
    returning whatever the broken text layer held — that is exactly the mojibake
    this module exists to prevent.
    """
    try:
        from marker.converters.pdf import PdfConverter  # type: ignore[import-not-found]
        from marker.models import create_model_dict  # type: ignore[import-not-found]
        from marker.output import text_from_rendered  # type: ignore[import-not-found]
    except ImportError:
        return (
            "",
            "none",
        )

    converter = PdfConverter(artifact_dict=create_model_dict())
    rendered = converter(data)
    text, _, _ = text_from_rendered(rendered)
    _ = max_pages
    return text, "marker"


def _docling_pdf(data: bytes) -> tuple[str, str]:
    """Parse with Docling, which leads on table fidelity."""
    try:
        from docling.document_converter import (  # type: ignore[import-not-found]
            DocumentConverter,
        )
    except ImportError:
        return "", "none"

    import io

    converter = DocumentConverter()
    result = converter.convert(io.BytesIO(data))
    return result.document.export_to_markdown(), "docling"
