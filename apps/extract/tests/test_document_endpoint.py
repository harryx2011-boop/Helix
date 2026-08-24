"""The /document contract: raw bytes in, typed status out."""

from __future__ import annotations

from fastapi.testclient import TestClient

from helix_extract.main import app

client = TestClient(app)

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_rejects_an_empty_body() -> None:
    response = client.post("/document", content=b"", headers={"content-type": "application/pdf"})
    assert response.status_code == 400


def test_answers_415_for_a_type_it_cannot_parse() -> None:
    response = client.post("/document", content=b"\x89PNG", headers={"content-type": "image/png"})
    assert response.status_code == 415
    assert "unsupported content type" in response.json()["detail"]


def test_answers_422_for_a_corrupt_file_rather_than_500() -> None:
    # A 500 would tell the gateway the service is down and worth retrying; a
    # truncated docx will fail the same way every time.
    response = client.post("/document", content=b"PK\x03\x04" + b"\x00" * 32, headers={"content-type": DOCX})
    assert response.status_code == 422
    assert "could not be parsed as docx" in response.json()["detail"]


def test_validates_query_options() -> None:
    response = client.post(
        "/document?ocr=sometimes", content=b"%PDF-1.4", headers={"content-type": "application/pdf"}
    )
    assert response.status_code == 422
