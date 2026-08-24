"""Provider routing for structured extraction.

The provider SDKs are imported lazily inside each adapter, so these tests run
without any of them installed: the adapters are replaced with stubs and the
routing, defaults and error translation around them are what is under test.
"""

from __future__ import annotations

import pytest

from helix_extract import llm
from helix_extract.settings import settings

SCHEMA = {"type": "object", "properties": {"title": {"type": "string"}}}


def _result(model: str) -> llm.ExtractionResult:
    return llm.ExtractionResult(data={"title": "T"}, tokens_input=1, tokens_output=1, model_used=model)


class TestResolve:
    def test_instance_default_when_nothing_is_overridden(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        assert llm._resolve(None, None) == ("anthropic", "claude-sonnet-4-5")

    def test_explicit_model_wins(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "openai")
        assert llm._resolve("gpt-4.1", "openai") == ("openai", "gpt-4.1")

    def test_provider_override_does_not_carry_the_instance_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # HELIX_LLM_MODEL belongs to the instance's provider. Sending it to
        # another vendor is a 404 dressed up as a 500.
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        provider, model = llm._resolve(None, "openai")
        assert provider == "openai"
        assert model == llm.DEFAULT_MODELS["openai"]

    def test_same_family_keeps_the_instance_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "ollama")
        monkeypatch.setattr(settings, "helix_llm_model", "qwen2.5")
        assert llm._resolve(None, "vllm") == ("vllm", "qwen2.5")
        monkeypatch.setattr(settings, "helix_llm_provider", "gemini")
        monkeypatch.setattr(settings, "helix_llm_model", "gemini-2.5-pro")
        assert llm._resolve(None, "google") == ("google", "gemini-2.5-pro")

    def test_local_runtime_without_a_model_is_the_callers_to_fix(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        with pytest.raises(llm.RequestError) as excinfo:
            llm._resolve(None, "ollama")
        assert excinfo.value.field == "model"
        assert "ollama" in excinfo.value.message


class TestOpenAiWireCredentials:
    def test_openrouter_uses_its_own_key_and_host(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "openai_api_key", "sk-openai")
        monkeypatch.setattr(settings, "openrouter_api_key", "sk-or")
        key, url = llm._openai_wire_credentials("openrouter")
        assert key == "sk-or"
        assert url is not None and "openrouter.ai" in url

    def test_openrouter_without_a_key_names_the_setting(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "openai_api_key", "sk-openai")
        monkeypatch.setattr(settings, "openrouter_api_key", None)
        with pytest.raises(llm.ProviderError, match="OPENROUTER_API_KEY"):
            llm._openai_wire_credentials("openrouter")

    def test_local_runtime_needs_a_base_url_not_a_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "openai_compatible_base_url", "http://localhost:11434/v1")
        monkeypatch.setattr(settings, "openai_compatible_api_key", None)
        assert llm._openai_wire_credentials("ollama") == ("not-needed", "http://localhost:11434/v1")
        monkeypatch.setattr(settings, "openai_compatible_base_url", None)
        with pytest.raises(llm.ProviderError, match="OPENAI_COMPATIBLE_BASE_URL"):
            llm._openai_wire_credentials("vllm")

    def test_openai_never_borrows_the_openrouter_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "openai_api_key", None)
        monkeypatch.setattr(settings, "openai_compatible_base_url", None)
        monkeypatch.setattr(settings, "openrouter_api_key", "sk-or")
        with pytest.raises(llm.ProviderError, match="OPENAI_API_KEY"):
            llm._openai_wire_credentials("openai")


class TestExtractStructured:
    @pytest.mark.asyncio
    async def test_sdk_failures_become_provider_errors_with_the_reason(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class NotFound(Exception):
            status_code = 404

        async def failing(*_args: object, **_kwargs: object) -> llm.ExtractionResult:
            raise NotFound("model `does-not-exist` not found")

        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(llm, "_call_anthropic", failing)

        with pytest.raises(llm.ProviderError) as excinfo:
            await llm.extract_structured("content", SCHEMA, model="does-not-exist")
        message = str(excinfo.value)
        assert "anthropic (does-not-exist)" in message
        assert "HTTP 404" in message
        assert "not found" in message

    @pytest.mark.asyncio
    async def test_routes_the_override_to_that_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: dict[str, object] = {}

        async def openai_stub(
            _content: str, _schema: dict, _prompt: str | None, model: str, *, provider: str = "openai"
        ) -> llm.ExtractionResult:
            seen["model"] = model
            seen["provider"] = provider
            return _result(model)

        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(settings, "helix_llm_model", "claude-sonnet-4-5")
        monkeypatch.setattr(llm, "_call_openai", openai_stub)

        result = await llm.extract_structured("content", SCHEMA, provider="openrouter")
        assert seen == {"model": llm.DEFAULT_MODELS["openrouter"], "provider": "openrouter"}
        assert result.data == {"title": "T"}

    @pytest.mark.asyncio
    async def test_sources_are_the_passages_that_reached_the_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def stub(*_args: object, **_kwargs: object) -> llm.ExtractionResult:
            return _result("m")

        monkeypatch.setattr(settings, "helix_llm_provider", "anthropic")
        monkeypatch.setattr(llm, "_call_anthropic", stub)

        content = "# Title\n\nThe title is here.\n\nUnrelated footer text."
        without = await llm.extract_structured(content, SCHEMA)
        assert without.sources == []

        with_sources = await llm.extract_structured(content, SCHEMA, include_sources=True)
        assert [s["index"] for s in with_sources.sources] == [0, 1]
        assert with_sources.sources[0]["text"].startswith("# Title")
        assert all({"text", "score", "index"} <= set(s) for s in with_sources.sources)
