"""The /convert contract: raw bytes in, converted bytes out, nothing else."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

from helix_extract.main import app

client = TestClient(app)


def make_pdf(pages: int = 1) -> bytes:
    reportlab = pytest.importorskip("reportlab.pdfgen.canvas")
    buffer = io.BytesIO()
    pdf = reportlab.Canvas(buffer, pagesize=(200, 200))
    for page in range(pages):
        pdf.drawString(20, 100, f"page {page + 1}")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def make_png() -> bytes:
    from PIL import Image

    image = Image.new("RGB", (16, 16), (200, 50, 50))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_rejects_an_empty_body() -> None:
    response = client.post(
        "/convert?to=png", content=b"", headers={"content-type": "application/pdf"}
    )
    assert response.status_code == 400


def test_answers_415_for_a_source_type_it_cannot_convert() -> None:
    docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    response = client.post("/convert?to=png", content=b"PK\x03\x04", headers={"content-type": docx})
    assert response.status_code == 415
    assert "conversion is not supported from" in response.json()["detail"]


def test_answers_415_for_an_unsupported_target_format() -> None:
    response = client.post(
        "/convert?to=bmp", content=make_pdf(), headers={"content-type": "application/pdf"}
    )
    assert response.status_code == 422


def test_answers_415_when_the_source_cannot_reach_the_requested_target() -> None:
    # png can become jpeg but not itself; asking for the identity conversion is
    # a caller error, not something the route should silently no-op.
    response = client.post(
        "/convert?to=png", content=make_png(), headers={"content-type": "image/png"}
    )
    assert response.status_code == 415
    assert "cannot convert to png" in response.json()["detail"]


def test_answers_422_for_a_corrupt_pdf_rather_than_500() -> None:
    response = client.post(
        "/convert?to=png", content=b"%PDF-garbage", headers={"content-type": "application/pdf"}
    )
    assert response.status_code == 422
    assert "could not be parsed as pdf" in response.json()["detail"]


def test_rasterizes_a_pdf_page_to_png() -> None:
    from PIL import Image

    response = client.post(
        "/convert?to=png", content=make_pdf(), headers={"content-type": "application/pdf"}
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["x-helix-convert-pages"] == "1"
    assert response.headers["x-helix-convert-page"] == "1"
    image = Image.open(io.BytesIO(response.content))
    image.verify()
    assert Image.open(io.BytesIO(response.content)).format == "PNG"


def test_rasterizes_a_specific_page_of_a_multipage_pdf() -> None:
    response = client.post(
        "/convert?to=jpeg&page=2",
        content=make_pdf(pages=3),
        headers={"content-type": "application/pdf"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-helix-convert-pages"] == "3"
    assert response.headers["x-helix-convert-page"] == "2"


def test_answers_422_for_a_page_number_past_the_end() -> None:
    response = client.post(
        "/convert?to=png&page=9",
        content=make_pdf(pages=1),
        headers={"content-type": "application/pdf"},
    )
    assert response.status_code == 422
    assert "does not exist" in response.json()["detail"]


def test_converts_png_to_jpeg() -> None:
    from PIL import Image

    response = client.post(
        "/convert?to=jpeg", content=make_png(), headers={"content-type": "image/png"}
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-helix-convert-page"] == ""
    image = Image.open(io.BytesIO(response.content))
    image.verify()
    assert Image.open(io.BytesIO(response.content)).format == "JPEG"


def test_a_custom_dpi_is_honoured() -> None:
    from PIL import Image

    low = client.post(
        "/convert?to=png&dpi=72", content=make_pdf(), headers={"content-type": "application/pdf"}
    )
    high = client.post(
        "/convert?to=png&dpi=288", content=make_pdf(), headers={"content-type": "application/pdf"}
    )

    low_image = Image.open(io.BytesIO(low.content))
    high_image = Image.open(io.BytesIO(high.content))
    assert high_image.size[0] > low_image.size[0]


def test_validates_the_dpi_range() -> None:
    response = client.post(
        "/convert?to=png&dpi=10000", content=make_pdf(), headers={"content-type": "application/pdf"}
    )
    assert response.status_code == 422
