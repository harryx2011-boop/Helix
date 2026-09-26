"""Tests for document parsing and PDF classification."""

from __future__ import annotations

import io
import sys

import pytest

from helix_extract.documents import (
    DocumentError,
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


def make_short_pdf(text: str, to_unicode_start: int | None = None) -> bytes:
    """A one-page PDF built by hand, so it needs no PDF-writing dependency.

    With `to_unicode_start`, a ToUnicode CMap remaps every byte into that code
    point range: the broken-CMap case that yields a garbled text layer.
    """
    content = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("latin-1")
    font = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]"
        b" /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        font + (b" >>" if to_unicode_start is None else b" /ToUnicode 6 0 R >>"),
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
    ]
    if to_unicode_start is not None:
        cmap = (
            "/CIDInit /ProcSet findresource begin 12 dict begin begincmap "
            "/CMapName /Garbled def 1 begincodespacerange <00> <FF> endcodespacerange "
            f"1 beginbfrange <00> <FF> <{to_unicode_start:04X}> endbfrange "
            "endcmap CMapName currentdict /CMap defineresource pop end end"
        ).encode()
        objects.append(b"<< /Length %d >>\nstream\n" % len(cmap) + cmap + b"\nendstream")

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


@pytest.fixture
def marker_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    # A None entry in sys.modules makes every `from marker... import` raise
    # ImportError, which is exactly what a base install without the extra sees.
    monkeypatch.setitem(sys.modules, "marker", None)


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


@pytest.mark.usefixtures("marker_absent")
class TestShortPdfWithoutOcr:
    # A one-line PDF falls under MIN_CHARS_PER_PAGE and so is flagged for OCR,
    # but its text is real. With no OCR parser installed, that text is the best
    # answer available and must not be thrown away.

    @pytest.mark.parametrize("ocr", ["auto", "always", "never"])
    def test_keeps_a_short_clean_text_layer(self, ocr: str) -> None:
        data = make_short_pdf("Dummy PDF file")
        assert assess_pdf(data).needs_ocr

        result = parse(data, "application/pdf", ocr=ocr)

        assert "Dummy PDF file" in result.markdown
        assert result.needs_ocr
        assert not result.ocr_applied
        assert not result.suspected_garbled_text
        assert result.parser_used == "pypdfium2"

    def test_still_withholds_a_garbled_text_layer(self) -> None:
        data = make_short_pdf("Dummy PDF file", to_unicode_start=0xE000)
        assert assess_pdf(data).suspected_garbled_text

        result = parse(data, "application/pdf", ocr="auto")

        assert result.markdown == ""
        assert result.needs_ocr
        assert result.suspected_garbled_text
        assert not result.ocr_applied
        assert result.parser_used == "none"

    def test_reports_no_parser_for_a_scan_with_no_text_at_all(self) -> None:
        result = parse(make_short_pdf(""), "application/pdf", ocr="auto")

        assert result.markdown == ""
        assert result.needs_ocr
        assert not result.ocr_applied
        assert result.parser_used == "none"


class TestCorruptFiles:
    # A zip signature followed by nothing is what a truncated upload looks like.
    ZIP_STUB = b"PK\x03\x04" + b"\x00" * 32

    @pytest.mark.parametrize(
        ("content_type", "kind"),
        [
            ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
            ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"),
            ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
        ],
    )
    def test_reports_a_broken_office_container_as_the_files_fault(self, content_type: str, kind: str) -> None:
        with pytest.raises(DocumentError, match=f"could not be parsed as {kind}"):
            parse(self.ZIP_STUB, content_type)

    def test_reports_an_unopenable_pdf_when_ocr_is_declined(self) -> None:
        # With OCR off the text-layer parser has to open the bytes itself, and
        # a PDF header on garbage is a bad file, not a service outage.
        with pytest.raises(DocumentError, match="could not be parsed as pdf"):
            parse(b"%PDF-garbage", "application/pdf", ocr="never")
