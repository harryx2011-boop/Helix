"""Tests for PDF page rasterization and PNG/JPEG conversion."""

from __future__ import annotations

import io

import pytest

from helix_extract.convert import (
    CONTENT_TYPE_FOR,
    SOURCE_FORMAT,
    SUPPORTED_TARGETS,
    ConvertFormat,
    convert_image,
    convert_pdf_page,
)
from helix_extract.documents import DocumentError


def make_pdf(pages: int = 1) -> bytes:
    """A small PDF with real, renderable page content."""
    reportlab = pytest.importorskip("reportlab.pdfgen.canvas")

    buffer = io.BytesIO()
    pdf = reportlab.Canvas(buffer, pagesize=(200, 200))
    for page in range(pages):
        pdf.drawString(20, 100, f"page {page + 1}")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def make_png(size: tuple[int, int] = (16, 16), mode: str = "RGB") -> bytes:
    from PIL import Image

    image = Image.new(mode, size, (200, 50, 50) if mode == "RGB" else (200, 50, 50, 128))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_jpeg(size: tuple[int, int] = (16, 16)) -> bytes:
    from PIL import Image

    image = Image.new("RGB", size, (10, 200, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


class TestSupportedTargets:
    def test_pdf_rasterizes_to_both_image_formats(self) -> None:
        assert set(SUPPORTED_TARGETS["pdf"]) == {ConvertFormat.PNG, ConvertFormat.JPEG}

    def test_png_and_jpeg_only_convert_to_each_other(self) -> None:
        assert SUPPORTED_TARGETS["png"] == (ConvertFormat.JPEG,)
        assert SUPPORTED_TARGETS["jpg"] == (ConvertFormat.PNG,)

    def test_no_office_or_pdf_authoring_target_exists(self) -> None:
        # The scope this module deliberately excludes: nothing converts TO pdf,
        # docx, pptx or xlsx, since none of those can be authored here.
        all_targets = {target for targets in SUPPORTED_TARGETS.values() for target in targets}
        assert all_targets == {ConvertFormat.PNG, ConvertFormat.JPEG}


class TestConvertPdfPage:
    def test_rasterizes_the_first_page_to_a_valid_png(self) -> None:
        from PIL import Image

        result = convert_pdf_page(make_pdf(), ConvertFormat.PNG)

        assert result.content_type == "image/png"
        assert result.pages == 1
        assert result.page_converted == 1
        image = Image.open(io.BytesIO(result.data))
        image.verify()
        assert Image.open(io.BytesIO(result.data)).format == "PNG"

    def test_rasterizes_to_a_valid_jpeg(self) -> None:
        from PIL import Image

        result = convert_pdf_page(make_pdf(), ConvertFormat.JPEG)

        assert result.content_type == "image/jpeg"
        image = Image.open(io.BytesIO(result.data))
        image.verify()
        assert Image.open(io.BytesIO(result.data)).format == "JPEG"

    def test_selects_the_requested_page_of_a_multipage_pdf(self) -> None:
        result_page_1 = convert_pdf_page(make_pdf(pages=3), ConvertFormat.PNG, page=1)
        result_page_2 = convert_pdf_page(make_pdf(pages=3), ConvertFormat.PNG, page=2)

        assert result_page_1.pages == 3
        assert result_page_2.pages == 3
        # Different page content rasterizes to different bytes.
        assert result_page_1.data != result_page_2.data

    def test_a_higher_dpi_produces_a_larger_image(self) -> None:
        from PIL import Image

        low = convert_pdf_page(make_pdf(), ConvertFormat.PNG, dpi=72)
        high = convert_pdf_page(make_pdf(), ConvertFormat.PNG, dpi=288)

        low_image = Image.open(io.BytesIO(low.data))
        high_image = Image.open(io.BytesIO(high.data))
        assert high_image.size[0] > low_image.size[0]

    def test_an_out_of_range_page_raises_document_error(self) -> None:
        with pytest.raises(DocumentError, match="page 5 does not exist"):
            convert_pdf_page(make_pdf(pages=1), ConvertFormat.PNG, page=5)

    def test_a_corrupt_pdf_fails_the_same_honest_way_parse_does(self) -> None:
        with pytest.raises(DocumentError, match="could not be parsed as pdf"):
            convert_pdf_page(b"%PDF-garbage", ConvertFormat.PNG)

    def test_a_pdf_pdfium_cannot_open_raises_document_error_rather_than_returning_garbage(
        self,
    ) -> None:
        reportlab = pytest.importorskip("reportlab.pdfgen.canvas")
        buffer = io.BytesIO()
        pdf = reportlab.Canvas(buffer)
        pdf.save()
        with pytest.raises(DocumentError, match="could not be parsed as pdf"):
            convert_pdf_page(buffer.getvalue(), ConvertFormat.PNG)


class TestConvertImage:
    def test_png_to_jpeg_produces_a_valid_jpeg(self) -> None:
        from PIL import Image

        result = convert_image(make_png(), SOURCE_FORMAT["png"], ConvertFormat.JPEG)

        assert result.content_type == "image/jpeg"
        image = Image.open(io.BytesIO(result.data))
        image.verify()
        assert Image.open(io.BytesIO(result.data)).format == "JPEG"

    def test_jpeg_to_png_produces_a_valid_png(self) -> None:
        from PIL import Image

        result = convert_image(make_jpeg(), SOURCE_FORMAT["jpg"], ConvertFormat.PNG)

        assert result.content_type == "image/png"
        image = Image.open(io.BytesIO(result.data))
        image.verify()
        assert Image.open(io.BytesIO(result.data)).format == "PNG"

    def test_transparency_is_flattened_onto_white_for_jpeg(self) -> None:
        from PIL import Image

        transparent_png = make_png(mode="RGBA")
        result = convert_image(transparent_png, SOURCE_FORMAT["png"], ConvertFormat.JPEG)

        image = Image.open(io.BytesIO(result.data))
        assert image.mode == "RGB"

    def test_a_corrupt_image_raises_document_error(self) -> None:
        with pytest.raises(DocumentError):
            convert_image(b"not an image", SOURCE_FORMAT["png"], ConvertFormat.JPEG)

    def test_content_type_map_covers_every_format(self) -> None:
        assert CONTENT_TYPE_FOR[ConvertFormat.PNG] == "image/png"
        assert CONTENT_TYPE_FOR[ConvertFormat.JPEG] == "image/jpeg"
