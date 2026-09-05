"""cost_usd from a pinned price table.

Helix takes no margin on inference — the operator's provider bills them
directly — so this exists only to surface what a call likely cost, not to
charge for it. A model absent from `PRICE_TABLE` prices as `None`: unpriced is
a distinct state from free, and guessing a rate would read as more certain
than this module has any right to be. A local runtime (Ollama, vLLM, LM
Studio) is priced at exactly 0.0, not absent, because it genuinely costs
nothing to call — see PRICE_TABLE's own note on that distinction.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Usage:
    tokens_input: int
    tokens_output: int
    tokens_cache_read: int = 0
    tokens_cache_write: int = 0


@dataclass(frozen=True)
class Rate:
    input_per_million: float
    output_per_million: float
    # Multipliers on `input_per_million`, not standalone rates: every provider
    # that reports cache tokens prices them as a fraction or multiple of the
    # same fresh-input rate, never a rate of their own.
    cache_read_multiplier: float = 0.1
    cache_write_multiplier: float = 1.25


# USD per 1,000,000 tokens. Keyed by (provider, model) rather than model alone,
# because the same model name can mean different rates behind different wire
# formats (e.g. an OpenRouter-routed model is not this table's problem to
# price — see the note below).
#
# Anthropic: platform.claude.com/docs/en/about-claude/pricing, checked
# 2026-09-05. Cache read at 0.1x input and cache write at 1.25x input are
# Anthropic's own published ratios, uniform across this model family.
PRICE_TABLE: dict[tuple[str, str], Rate] = {
    ("anthropic", "claude-opus-5"): Rate(5.0, 25.0),
    ("anthropic", "claude-sonnet-5"): Rate(2.0, 10.0),
    ("anthropic", "claude-haiku-4-5"): Rate(1.0, 5.0),

    # OpenAI, Gemini and OpenRouter entries go here ONLY with a cited source
    # checked against this codebase's actual DEFAULT_MODELS/adapter model set
    # (see llm.py). None are added speculatively: an uncited row is a guess
    # wearing a price tag, and this table's whole point is refusing to guess.

    # Local runtimes speak the OpenAI wire format but run on the operator's
    # own hardware — priced at exactly zero, not absent, so a caller reading
    # `cost_usd` sees a real answer rather than the "unpriced" case reserved
    # for a model this table has no opinion on.
    ("ollama", "*"): Rate(0.0, 0.0, cache_read_multiplier=0.0, cache_write_multiplier=0.0),
    ("vllm", "*"): Rate(0.0, 0.0, cache_read_multiplier=0.0, cache_write_multiplier=0.0),
    ("openai-compatible", "*"): Rate(0.0, 0.0, cache_read_multiplier=0.0, cache_write_multiplier=0.0),
}


def rate_for(provider: str, model: str) -> Rate | None:
    """The priced rate for this exact (provider, model), or None if unpriced.

    Local runtimes match on a `"*"` wildcard model, since what is actually
    hosted behind them is the operator's own choice and this table cannot
    enumerate it — but the *provider* being local is enough to know the cost
    is zero.
    """
    exact = PRICE_TABLE.get((provider, model))
    if exact is not None:
        return exact
    return PRICE_TABLE.get((provider, "*"))


def cost_usd(provider: str, model: str, usage: Usage) -> float | None:
    """What this call cost, or None if `(provider, model)` is unpriced.

    Fresh input, cache read and cache write are billed separately and summed;
    a rate's cache multipliers apply to its own `input_per_million`, matching
    how every priced provider here actually publishes cache pricing.
    """
    rate = rate_for(provider, model)
    if rate is None:
        return None
    return (
        (usage.tokens_input / 1_000_000) * rate.input_per_million
        + (usage.tokens_output / 1_000_000) * rate.output_per_million
        + (usage.tokens_cache_read / 1_000_000) * rate.input_per_million * rate.cache_read_multiplier
        + (usage.tokens_cache_write / 1_000_000) * rate.input_per_million * rate.cache_write_multiplier
    )


__all__ = ["PRICE_TABLE", "Rate", "Usage", "cost_usd", "rate_for"]
