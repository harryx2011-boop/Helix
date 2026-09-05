"""The /assess contract: raw PDF bytes in, a classification out, nothing converted."""

from __future__ import annotations

from fastapi.testclient import TestClient

from helix_extract.main import app

client = TestClient(app)


def test_rejects_an_empty_body() -> None:
    response = client.post("/assess", content=b"", headers={"content-type": "application/pdf"})
    assert response.status_code == 400


def test_answers_415_for_a_non_pdf_type() -> None:
    response = client.post("/assess", content=b"\x89PNG", headers={"content-type": "image/png"})
    assert response.status_code == 415
    assert "only defined for PDFs" in response.json()["detail"]


def test_answers_415_for_an_unspecified_type() -> None:
    response = client.post("/assess", content=b"some bytes")
    assert response.status_code == 415


def test_accepts_application_x_pdf_as_a_pdf_alias() -> None:
    response = client.post("/assess", content=b"%PDF-1.4\n%%EOF", headers={"content-type": "application/x-pdf"})
    assert response.status_code == 200


def test_returns_the_assessment_shape_for_a_pdf() -> None:
    response = client.post("/assess", content=b"%PDF-1.4\n%%EOF", headers={"content-type": "application/pdf"})
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"pages", "chars_extracted", "needs_ocr", "suspected_garbled_text", "reason"}


def test_does_not_convert_anything_only_classifies() -> None:
    # A markdown-conversion field appearing here would mean this silently grew
    # into a second /document, rather than staying the classification-only step.
    response = client.post("/assess", content=b"%PDF-1.4\n%%EOF", headers={"content-type": "application/pdf"})
    assert "markdown" not in response.json()
