"""Format conversion for /convert -- PDF page rasterization and PNG/JPEG normalizing.

Scoped to what pypdfium2 and Pillow can do without becoming a general media
transcoder: reading a format the pipeline already parses, and re-encoding
pixels the pipeline already has in hand. Authoring a new PDF, DOCX, PPTX or
XLSX from other content is a different and much larger capability (a document
layout engine, not a codec) and stays out of scope.

**Classify before converting.** A PDF page is rendered from the same open
document handle `assess_pdf` uses, so a corrupt or mislabelled PDF fails the
same honest way `/parse` does, via `DocumentError`, rather than a codec-level
traceback the caller cannot act on.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

from .documents import DocumentError

if TYPE_CHECKING:
    from PIL.Image import Image

# 144 DPI: sharp enough for an LLM vision call or a downstream OCR pass without
# producing an unreasonably large PNG for a full page.
DEFAULT_DPI = 144
_POINTS_PER_INCH = 72


class ConvertFormat(str, Enum):
    PNG = "png"
    JPEG = "jpeg"


CONTENT_TYPE_FOR: dict[ConvertFormat, str] = {
    ConvertFormat.PNG: "image/png",
    ConvertFormat.JPEG: "image/jpeg",
}

# What each source kind can become. PDF only rasterizes; PNG and JPEG only
# re-encode to each other. Nothing converts to PDF, DOCX, PPTX or XLSX --
# writing those formats from scratch is the scope this module excludes.
SUPPORTED_TARGETS: dict[str, tuple[ConvertFormat, ...]] = {
    "pdf": (ConvertFormat.PNG, ConvertFormat.JPEG),
    "png": (ConvertFormat.JPEG,),
    "jpg": (ConvertFormat.PNG,),
}

# `documents.DocumentKind`/file-type convention names the JPEG source "jpg";
# `ConvertFormat` names the JPEG target "jpeg" to match its own content type.
# This is the one place the two vocabularies meet.
SOURCE_FORMAT: dict[str, ConvertFormat] = {
    "png": ConvertFormat.PNG,
    "jpg": ConvertFormat.JPEG,
}


@dataclass
class ConvertResult:
    data: bytes
    content_type: str
    pages: int
    page_converted: int | None


def _dpi_to_scale(dpi: int) -> float:
    return dpi / _POINTS_PER_INCH


def _encode_image(image: Image, target: ConvertFormat) -> bytes:
    from PIL import Image as PILImage

    buffer = io.BytesIO()
    if target is ConvertFormat.JPEG:
        # JPEG has no alpha channel; flattening onto white beats letting the
        # encoder choose, which silently drops transparency as black.
        if image.mode in ("RGBA", "LA", "P"):
            background = PILImage.new("RGB", image.size, (255, 255, 255))
            rgba = image.convert("RGBA")
            background.paste(rgba, mask=rgba.split()[-1])
            image = background
        else:
            image = image.convert("RGB")
        image.save(buffer, format="JPEG", quality=90)
    else:
        image.save(buffer, format="PNG")
    return buffer.getvalue()


def convert_pdf_page(
    data: bytes, target: ConvertFormat, page: int = 1, dpi: int = DEFAULT_DPI
) -> ConvertResult:
    """Rasterize one page of a PDF to PNG or JPEG.

    `page` is 1-based, matching how a caller thinks about a document. Reuses
    the same open/close handling `assess_pdf` and `_pdf_to_markdown` use, so a
    corrupt or mislabelled PDF raises `DocumentError` rather than whatever
    pdfium's own exception happens to say.
    """
    import pypdfium2 as pdfium

    try:
        document = pdfium.PdfDocument(data)
    except Exception as exc:
        raise DocumentError("pdf", exc) from exc

    try:
        total_pages = len(document)
        if total_pages == 0:
            raise DocumentError("pdf", ValueError("the PDF has no pages"))
        if page < 1 or page > total_pages:
            raise DocumentError(
                "pdf",
                ValueError(f"page {page} does not exist; the document has {total_pages} page(s)"),
            )

        pdf_page = document[page - 1]
        try:
            bitmap = pdf_page.render(scale=_dpi_to_scale(dpi))
            try:
                pil_image = bitmap.to_pil()
            finally:
                bitmap.close()
        finally:
            pdf_page.close()

        encoded = _encode_image(pil_image, target)
        return ConvertResult(
            data=encoded,
            content_type=CONTENT_TYPE_FOR[target],
            pages=total_pages,
            page_converted=page,
        )
    finally:
        document.close()


def convert_image(data: bytes, from_format: ConvertFormat, target: ConvertFormat) -> ConvertResult:
    """Re-encode an image between PNG and JPEG."""
    from PIL import Image, UnidentifiedImageError

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise DocumentError(from_format.value, exc) from exc

    encoded = _encode_image(image, target)
    return ConvertResult(
        data=encoded, content_type=CONTENT_TYPE_FOR[target], pages=1, page_converted=None
    )
