"""Tests for schema generation.

Same approach as test_llm.py: the provider SDKs are never imported here. The
`_call_*_json` adapters are stubbed so what's under test is resolution,
validation-then-repair, and error translation.
"""

from __future__ import annotations

import pytest

from helix_extract import llm, schema_gen
from helix_extract.settings import settings

VALID_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "The page title"},
        "price": {"type": "number", "description": "The listed price"},
    },
    "required": ["title"],
}


def _stub_returning(schema: dict, *, model: str = "stub-model", tokens: tuple[int, int] = (10, 5)):
    calls: list[str] = []

    async def stub(user_prompt: str, model_arg: str, **_kwargs: object):
        calls.append(user_prompt)
        return schema, tokens[0], tokens[1], model

    return stub, calls


class TestGenerateSchema:
    @pytest.mark.asyncio
    async def test_returns_the_schema_and_usage_on_first_try(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        stub, calls = _stub_returning(VALID_SCHEMA)
        monkeypatch.setattr(schema_gen, "_call_anthropic_json", stub)

        result = await schema_gen.generate_schema(prompt="pricing plans and their monthly cost")

        assert result.schema == VALID_SCHEMA
        assert result.tokens_input == 10
        assert result.tokens_output == 5
        assert result.model_used == "stub-model"
        assert "pricing plans" in calls[0]
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_includes_urls_hint_and_instruction_in_the_prompt(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        stub, calls = _stub_returning(VALID_SCHEMA)
        monkeypatch.setattr(schema_gen, "_call_anthropic_json", stub)

        await schema_gen.generate_schema(
            prompt="product listings",
            urls=["https://example.com/shop"],
            hint={"type": "object", "properties": {"name": {"type": "string"}}},
            instruction="also capture SKU",
        )

        prompt = calls[0]
        assert "https://example.com/shop" in prompt
        assert "\"name\"" in prompt
        assert "also capture SKU" in prompt

    @pytest.mark.asyncio
    async def test_repairs_once_when_the_model_returns_something_unusable(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        attempts = {"n": 0}

        async def stub(user_prompt: str, model_arg: str, **_kwargs: object):
            attempts["n"] += 1
            if attempts["n"] == 1:
                return {"not": "a schema"}, 10, 5, "stub-model"
            assert "not a valid JSON Schema" in user_prompt
            return VALID_SCHEMA, 10, 5, "stub-model"

        monkeypatch.setattr(schema_gen, "_call_anthropic_json", stub)

        result = await schema_gen.generate_schema(prompt="anything")

        assert result.schema == VALID_SCHEMA
        assert result.tokens_input == 20
        assert result.tokens_output == 10
        assert attempts["n"] == 2

    @pytest.mark.asyncio
    async def test_gives_up_after_one_failed_repair(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")

        async def always_bad(user_prompt: str, model_arg: str, **_kwargs: object):
            return {"not": "a schema"}, 1, 1, "stub-model"

        monkeypatch.setattr(schema_gen, "_call_anthropic_json", always_bad)

        with pytest.raises(llm.ProviderError, match="did not return a usable JSON Schema"):
            await schema_gen.generate_schema(prompt="anything")

    @pytest.mark.asyncio
    async def test_no_provider_configured_raises_provider_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "anthropic_api_key", None)

        with pytest.raises(llm.ProviderError, match="ANTHROPIC_API_KEY"):
            await schema_gen.generate_schema(prompt="anything")

    @pytest.mark.asyncio
    async def test_sdk_failure_becomes_a_provider_error_naming_provider_and_model(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class RateLimited(Exception):
            status_code = 429

        async def failing(user_prompt: str, model_arg: str, **_kwargs: object):
            raise RateLimited("too many requests")

        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        monkeypatch.setattr(schema_gen, "_call_anthropic_json", failing)

        with pytest.raises(llm.ProviderError) as excinfo:
            await schema_gen.generate_schema(prompt="anything")
        message = str(excinfo.value)
        assert "anthropic (claude-sonnet-4-5)" in message
        assert "HTTP 429" in message

    @pytest.mark.asyncio
    async def test_routes_to_the_overridden_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        stub, calls = _stub_returning(VALID_SCHEMA, model="gpt-test")
        monkeypatch.setattr(schema_gen, "_call_openai_json", stub)

        result = await schema_gen.generate_schema(prompt="anything", provider="openrouter")

        assert result.model_used == "gpt-test"
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_passes_the_callers_key_for_the_resolved_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: dict[str, object] = {}

        async def stub(user_prompt: str, model_arg: str, *, caller_key: str | None = None):
            seen["caller_key"] = caller_key
            return VALID_SCHEMA, 10, 5, model_arg

        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        monkeypatch.setattr(schema_gen, "_call_anthropic_json", stub)

        await schema_gen.generate_schema(prompt="anything", provider_keys={"anthropic": "sk-ant-caller"})
        assert seen["caller_key"] == "sk-ant-caller"

    @pytest.mark.asyncio
    async def test_auto_picks_a_caller_provider_when_the_instance_has_none(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen: dict[str, object] = {}

        async def stub(user_prompt: str, model_arg: str, *, caller_key: str | None = None):
            seen["caller_key"] = caller_key
            seen["model"] = model_arg
            return VALID_SCHEMA, 10, 5, model_arg

        monkeypatch.setattr(settings, "helix_llm_provider", "openai")
        monkeypatch.setattr(settings, "openai_api_key", None)
        monkeypatch.setattr(settings, "openai_compatible_base_url", None)
        monkeypatch.setattr(schema_gen, "_call_anthropic_json", stub)

        result = await schema_gen.generate_schema(prompt="anything", provider_keys={"anthropic": "sk-ant-caller"})

        assert seen["caller_key"] == "sk-ant-caller"
        assert seen["model"] == llm.DEFAULT_MODELS["anthropic"]
        assert result.schema == VALID_SCHEMA

    @pytest.mark.asyncio
    async def test_caller_key_carries_through_a_repair_attempt(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen_keys: list[str | None] = []

        async def stub(user_prompt: str, model_arg: str, *, caller_key: str | None = None):
            seen_keys.append(caller_key)
            if len(seen_keys) == 1:
                return {"not": "a schema"}, 10, 5, model_arg
            return VALID_SCHEMA, 10, 5, model_arg

        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        monkeypatch.setattr(schema_gen, "_call_anthropic_json", stub)

        result = await schema_gen.generate_schema(prompt="anything", provider_keys={"anthropic": "sk-ant-caller"})

        assert result.schema == VALID_SCHEMA
        assert seen_keys == ["sk-ant-caller", "sk-ant-caller"]


class TestSummarise:
    def test_names_the_fields_and_counts_them(self) -> None:
        summary = schema_gen._summarise(VALID_SCHEMA)
        assert "2 fields" in summary
        assert "title" in summary
        assert "price" in summary

    def test_handles_an_empty_schema(self) -> None:
        assert schema_gen._summarise({"type": "object", "properties": {}}) == "An empty schema."

    def test_truncates_a_long_field_list(self) -> None:
        properties = {f"field{i}": {"type": "string"} for i in range(9)}
        summary = schema_gen._summarise({"type": "object", "properties": properties})
        assert "9 fields" in summary
        assert "3 more" in summary


class TestIsUsableSchema:
    def test_accepts_an_object_schema_with_properties(self) -> None:
        assert schema_gen._is_usable_schema(VALID_SCHEMA) is True

    @pytest.mark.parametrize(
        "candidate",
        [
            {"type": "array", "properties": {}},
            {"type": "object"},
            {"properties": {"a": {"type": "string"}}},
            "not a dict",
            None,
        ],
    )
    def test_rejects_anything_else(self, candidate: object) -> None:
        assert schema_gen._is_usable_schema(candidate) is False
