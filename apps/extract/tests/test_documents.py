"""Tests for document parsing and PDF classification."""

from __future__ import annotations

import io

import pytest

from helix_extract.documents import (
    DocumentKind,
    assess_pdf,
    classify_content_type,
    looks_garbled,
    parse,
)


def make_pdf(text: str, pages: int = 1) -> bytes:
    """A small PDF with a real, readable text layer."""
    pypdfium2 = pytest.importorskip("pypdfium2")
    reportlab = pytest.importorskip("reportlab.pdfgen.canvas")

    buffer = io.BytesIO()
    pdf = reportlab.Canvas(buffer)
    for page in range(pages):
        pdf.drawString(72, 720, f"{text} (page {page + 1})")
        for line in range(20):
            pdf.drawString(72, 700 - line * 20, f"Line {line} of readable body text content.")
        pdf.showPage()
    pdf.save()

    _ = pypdfium2
    return buffer.getvalue()


def make_empty_pdf(pages: int = 2) -> bytes:
    """A PDF with pages but no text — what a scan looks like to a parser."""
    reportlab = pytest.importorskip("reportlab.pdfgen.canvas")

    buffer = io.BytesIO()
    pdf = reportlab.Canvas(buffer)
    for _ in range(pages):
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


class TestClassifyContentType:
    def test_recognises_the_supported_formats(self) -> None:
        assert classify_content_type("application/pdf") is DocumentKind.PDF
        assert (
            classify_content_type(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
            is DocumentKind.DOCX
        )

    def test_ignores_charset_parameters(self) -> None:
        assert classify_content_type("application/pdf; charset=binary") is DocumentKind.PDF

    def test_is_case_insensitive(self) -> None:
        assert classify_content_type("APPLICATION/PDF") is DocumentKind.PDF

    def test_reports_unknown_rather_than_guessing(self) -> None:
        assert classify_content_type("image/png") is DocumentKind.UNKNOWN


class TestLooksGarbled:
    def test_accepts_ordinary_prose(self) -> None:
        assert not looks_garbled("The quick brown fox jumps over the lazy dog.")

    def test_accepts_non_latin_scripts(self) -> None:
        # CJK text is the case that breaks naive heuristics: it is legitimate
        # content with no Latin word shapes at all, and must not be mistaken for
        # mojibake simply for being unfamiliar.
        assert not looks_garbled("这是一段完全正常的中文文本，应该被正确识别。" * 5)
        assert not looks_garbled("これは正常な日本語のテキストです。" * 5)

    def test_flags_replacement_characters(self) -> None:
        assert looks_garbled("���������� ���� ��������")

    def test_flags_private_use_characters(self) -> None:
        # A subsetted font with no ToUnicode table decodes into this range.
        assert looks_garbled("" * 10)

    def test_treats_empty_input_as_not_garbled(self) -> None:
        # Nothing to judge. "Empty" is a separate condition from "wrong".
        assert not looks_garbled("")


class TestAssessPdf:
    def test_accepts_a_readable_text_layer(self) -> None:
        assessment = assess_pdf(make_pdf("Readable document"))

        assert assessment.pages == 1
        assert not assessment.needs_ocr
        assert not assessment.suspected_garbled_text
        assert assessment.chars_extracted > 0

    def test_flags_a_pdf_with_no_text_as_needing_ocr(self) -> None:
        # This is the scanned-document case. Parsing anyway produces nothing,
        # and reporting that as clean output is how empty results reach a RAG index.
        assessment = assess_pdf(make_empty_pdf())

        assert assessment.needs_ocr
        assert "scanned" in assessment.reason or "characters per page" in assessment.reason

    def test_reports_a_reason_for_every_verdict(self) -> None:
        assert assess_pdf(make_pdf("Something")).reason
        assert assess_pdf(make_empty_pdf()).reason

    def test_handles_a_corrupt_file_without_raising(self) -> None:
        assessment = assess_pdf(b"this is not a pdf at all")

        assert assessment.needs_ocr
        assert assessment.pages == 0


class TestParse:
    def test_extracts_text_from_a_clean_pdf(self) -> None:
        result = parse(make_pdf("Hello document"), "application/pdf")

        assert "Hello document" in result.markdown
        assert result.parser_used == "pypdfium2"
        assert not result.ocr_applied

    def test_marks_page_boundaries_so_citations_stay_locatable(self) -> None:
        result = parse(make_pdf("Multi", pages=3), "application/pdf")

        assert "<!-- page 1 -->" in result.markdown
        assert "<!-- page 3 -->" in result.markdown

    def test_respects_max_pages(self) -> None:
        result = parse(make_pdf("Long", pages=5), "application/pdf", max_pages=2)

        assert "<!-- page 2 -->" in result.markdown
        assert "<!-- page 3 -->" not in result.markdown
        # The page count still reports the true total, not the truncated one.
        assert result.pages == 5

    def test_reports_ocr_need_even_when_ocr_is_declined(self) -> None:
        # `never` accepts a degraded answer, but the flags must still say what
        # was found — otherwise empty output reads as a genuinely empty document.
        result = parse(make_empty_pdf(), "application/pdf", ocr="never")

        assert result.needs_ocr
        assert not result.ocr_applied

    def test_does_not_claim_ocr_ran_when_marker_is_absent(self) -> None:
        # Marker ships in the `documents` extra. Without it, the honest answer is
        # an empty result flagged as needing OCR — never the broken text layer.
        result = parse(make_empty_pdf(), "application/pdf", ocr="always")

        if result.parser_used == "none":
            assert not result.ocr_applied
            assert result.needs_ocr

    def test_rejects_an_unsupported_type(self) -> None:
        with pytest.raises(ValueError, match="unsupported content type"):
            parse(b"\x89PNG", "image/png")
