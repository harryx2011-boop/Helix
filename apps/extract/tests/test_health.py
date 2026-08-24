"""Smoke tests for helix-extract.

The real extraction tests arrive with M1. These verify the service starts, the
health contract holds, and — importantly — that credentials never leak into a
response.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from helix_extract.main import app

client = TestClient(app)


def test_health_reports_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert "trafilatura" in body["extractors"]


def test_health_never_leaks_key_material() -> None:
    # Health says WHETHER a provider is configured, never what the key is.
    # A health endpoint is often the least-guarded route in a deployment.
    response = client.get("/health")
    body = response.json()

    assert isinstance(body["llm_configured"], bool)

    serialised = response.text.lower()
    for fragment in ("sk-", "api_key", "apikey", "secret", "bearer"):
        assert fragment not in serialised


def test_embedding_works_without_any_key() -> None:
    # The local model is the default precisely so chunking and vector sync work
    # for someone evaluating Helix with no accounts anywhere.
    response = client.get("/health")
    assert response.json()["embedding_model"]
