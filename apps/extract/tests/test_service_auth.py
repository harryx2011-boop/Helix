"""The shared secret between the API and this service.

With HELIX_SERVICE_TOKEN set, every route but /health needs the token, so a
process that can reach the port cannot drive the service directly.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from helix_extract.main import app

client = TestClient(app)
BODY = {"text": "hello world", "strategy": "fixed", "max_tokens": 64, "overlap": 0}


def test_open_when_no_token_is_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HELIX_SERVICE_TOKEN", raising=False)
    assert client.post("/chunk", json=BODY).status_code != 401


def test_refuses_a_missing_or_wrong_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HELIX_SERVICE_TOKEN", "secret-token")
    assert client.post("/chunk", json=BODY).status_code == 401
    wrong = {"x-helix-service-token": "secret-tokeX"}
    assert client.post("/chunk", json=BODY, headers=wrong).status_code == 401


def test_accepts_the_configured_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HELIX_SERVICE_TOKEN", "secret-token")
    right = {"x-helix-service-token": "secret-token"}
    assert client.post("/chunk", json=BODY, headers=right).status_code != 401


def test_health_stays_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HELIX_SERVICE_TOKEN", "secret-token")
    assert client.get("/health").status_code == 200
