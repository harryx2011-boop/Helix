"""The /structured and /schema contracts accept and forward provider_keys."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from helix_extract import llm, schema_gen
from helix_extract.main import app

client = TestClient(app)


def test_structured_forwards_provider_keys_to_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def fake_extract_structured(**kwargs: object) -> llm.ExtractionResult:
        seen.update(kwargs)
        return llm.ExtractionResult(data={"title": "T"}, tokens_input=1, tokens_output=1, model_used="m")

    monkeypatch.setattr(llm, "extract_structured", fake_extract_structured)

    response = client.post(
        "/structured",
        json={
            "content": "some content",
            "schema": {"type": "object", "properties": {"title": {"type": "string"}}},
            "provider_keys": {"anthropic": "sk-ant-caller"},
            "provider_models": {"anthropic": "claude-sonnet-4-5"},
        },
    )

    assert response.status_code == 200
    assert seen["provider_keys"] == {"anthropic": "sk-ant-caller"}
    assert seen["provider_models"] == {"anthropic": "claude-sonnet-4-5"}


def test_structured_omits_provider_keys_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def fake_extract_structured(**kwargs: object) -> llm.ExtractionResult:
        seen.update(kwargs)
        return llm.ExtractionResult(data={}, tokens_input=1, tokens_output=1, model_used="m")

    monkeypatch.setattr(llm, "extract_structured", fake_extract_structured)

    response = client.post(
        "/structured",
        json={"content": "some content", "schema": {"type": "object", "properties": {}}},
    )

    assert response.status_code == 200
    assert seen["provider_keys"] is None
    assert seen["provider_models"] is None


def test_schema_forwards_provider_keys_to_schema_gen(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    async def fake_generate_schema(**kwargs: object) -> schema_gen.SchemaGenResult:
        seen.update(kwargs)
        return schema_gen.SchemaGenResult(
            schema={"type": "object", "properties": {}},
            summary="An empty schema.",
            tokens_input=1,
            tokens_output=1,
            model_used="m",
        )

    monkeypatch.setattr(schema_gen, "generate_schema", fake_generate_schema)

    response = client.post(
        "/schema",
        json={
            "prompt": "pricing plans",
            "provider_keys": {"openai": "sk-openai-caller"},
            "provider_models": {"openai": "gpt-4o-mini"},
        },
    )

    assert response.status_code == 200
    assert seen["provider_keys"] == {"openai": "sk-openai-caller"}
    assert seen["provider_models"] == {"openai": "gpt-4o-mini"}
