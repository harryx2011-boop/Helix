"""Tests for the shared provider call funnel.

`llm.py` and `schema_gen.py` both route their actual wire calls through
`call_structured`, so its retry and error-translation behaviour is tested
once, here, rather than through every vendor adapter that uses it.
"""

from __future__ import annotations

import pytest

from helix_extract import provider


class _Status(Exception):
    def __init__(self, status_code: int, message: str = "boom") -> None:
        super().__init__(message)
        self.status_code = status_code


class TestCallStructured:
    @pytest.mark.asyncio
    async def test_succeeds_on_the_first_attempt_without_sleeping(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def no_sleep(_seconds: float) -> None:
            raise AssertionError("should not sleep on a clean first attempt")

        monkeypatch.setattr(provider.asyncio, "sleep", no_sleep)

        async def call() -> tuple[dict, int, int, str]:
            return {"a": 1}, 5, 7, "model-x"

        outcome = await provider.call_structured("openai", "model-x", call)
        assert outcome.data == {"a": 1}
        assert outcome.tokens_input == 5
        assert outcome.tokens_output == 7
        assert outcome.model_used == "model-x"
        assert outcome.attempts == 1

    @pytest.mark.asyncio
    async def test_retries_a_rate_limit_and_then_succeeds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def instant_sleep(_seconds: float) -> None:
            return None

        monkeypatch.setattr(provider.asyncio, "sleep", instant_sleep)

        calls = {"n": 0}

        async def call() -> tuple[dict, int, int, str]:
            calls["n"] += 1
            if calls["n"] < 2:
                raise _Status(429)
            return {"ok": True}, 1, 1, "model-x"

        outcome = await provider.call_structured("openai", "model-x", call)
        assert outcome.attempts == 2
        assert calls["n"] == 2

    @pytest.mark.asyncio
    async def test_gives_up_after_max_attempts_and_raises_provider_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def instant_sleep(_seconds: float) -> None:
            return None

        monkeypatch.setattr(provider.asyncio, "sleep", instant_sleep)

        calls = {"n": 0}

        async def call() -> tuple[dict, int, int, str]:
            calls["n"] += 1
            raise _Status(503)

        with pytest.raises(provider.ProviderError, match="HTTP 503"):
            await provider.call_structured("anthropic", "model-x", call)
        assert calls["n"] == provider.MAX_ATTEMPTS

    @pytest.mark.asyncio
    async def test_does_not_retry_a_non_retryable_failure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def no_sleep(_seconds: float) -> None:
            raise AssertionError("a 400 should not be retried")

        monkeypatch.setattr(provider.asyncio, "sleep", no_sleep)

        calls = {"n": 0}

        async def call() -> tuple[dict, int, int, str]:
            calls["n"] += 1
            raise _Status(400, "bad schema")

        with pytest.raises(provider.ProviderError, match="HTTP 400"):
            await provider.call_structured("openai", "model-x", call)
        assert calls["n"] == 1

    @pytest.mark.asyncio
    async def test_provider_error_passes_through_unretried(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def no_sleep(_seconds: float) -> None:
            raise AssertionError("a ProviderError is not retried")

        monkeypatch.setattr(provider.asyncio, "sleep", no_sleep)

        async def call() -> tuple[dict, int, int, str]:
            raise provider.ProviderError("ANTHROPIC_API_KEY is not set.")

        with pytest.raises(provider.ProviderError, match="ANTHROPIC_API_KEY"):
            await provider.call_structured("anthropic", "model-x", call)
