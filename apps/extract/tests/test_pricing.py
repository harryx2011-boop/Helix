"""cost_usd from the pinned PRICE_TABLE — priced, unpriced, and free-local cases."""

from __future__ import annotations

from helix_extract.pricing import Usage, cost_usd


class TestCostUsd:
    def test_known_anthropic_usage_prices_to_six_decimals_including_cache_read(self) -> None:
        # claude-sonnet-5: input 2.0/M, output 10.0/M, cache read at 0.1x input.
        usage = Usage(tokens_input=100_000, tokens_output=50_000, tokens_cache_read=200_000)
        cost = cost_usd("anthropic", "claude-sonnet-5", usage)
        assert cost is not None
        assert round(cost, 6) == round(
            (100_000 / 1_000_000) * 2.0 + (50_000 / 1_000_000) * 10.0 + (200_000 / 1_000_000) * 2.0 * 0.1,
            6,
        )
        assert round(cost, 6) == 0.74

    def test_unknown_model_returns_none_with_tokens_intact(self) -> None:
        usage = Usage(tokens_input=100_000, tokens_output=50_000)
        assert cost_usd("anthropic", "claude-nonexistent-model", usage) is None
        # The Usage the caller built is untouched by an unpriced lookup.
        assert usage.tokens_input == 100_000
        assert usage.tokens_output == 50_000

    def test_ollama_prices_to_zero_not_none(self) -> None:
        usage = Usage(tokens_input=100_000, tokens_output=50_000, tokens_cache_read=10_000)
        assert cost_usd("ollama", "llama3.1", usage) == 0.0
