"""LLM providers, bring-your-own-key.

Helix never bundles a model. The operator configures a provider through the
environment, the call goes to their account, and their provider bills them.
There is no margin on inference here — which also means no incentive to be
vague about retries or failures.

Native adapters exist where the structured-output mechanism genuinely differs:
OpenAI, Anthropic and Gemini. Everything else — Ollama, vLLM, OpenRouter,
LM Studio — speaks the OpenAI wire format, so one adapter covers them all.

The actual wire call — retry, error classification — lives in `provider.py`;
this module resolves which vendor and model a request uses and builds each
vendor's request shape.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from . import relevance
from .context import system_prompt
from .fence import wrap
from .pricing import Usage as PricingUsage
from .pricing import cost_usd as price_cost_usd
from .provider import ProviderError, RequestError, call_structured, describe_failure
from .schema_compiler import (
    SchemaError,
    compile_anthropic,
    compile_anthropic_output_format,
    compile_gemini,
    compile_openai,
)
from .settings import settings


SYSTEM_PROMPT = system_prompt("extract")


def _anthropic_supports_output_format() -> bool:
    """Whether the installed SDK accepts ``output_config`` on `messages.create`.

    A feature check rather than a version guess: `anthropic` added
    `output_config`/structured outputs across a range of point releases, and
    pinning a cutoff version here would drift the moment either side updates
    independently of the other.
    """
    import inspect

    from anthropic.resources.messages.messages import AsyncMessages

    return "output_config" in inspect.signature(AsyncMessages.create).parameters


@dataclass
class ExtractionResult:
    data: dict[str, Any]
    tokens_input: int
    tokens_output: int
    model_used: str
    blocks_kept: int = 0
    blocks_total: int = 0
    # The passages that reached the model, when the caller asked for them.
    sources: list[dict[str, Any]] = field(default_factory=list)
    # Which provider actually answered, and every provider tried and abandoned
    # before it — empty when the first (resolved) provider succeeded.
    provider_used: str = ""
    fallback_from: list[dict[str, str]] = field(default_factory=list)
    # From pricing.PRICE_TABLE; None when (provider, model) is unpriced rather
    # than free — see that module's note on the distinction.
    cost_usd: float | None = None
    tokens_cache_read: int | None = None
    tokens_cache_write: int | None = None


# What a provider override runs when the request names no model. The instance's
# HELIX_LLM_MODEL belongs to the instance's provider and means nothing elsewhere.
DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-5",
    "gemini": "gemini-2.5-flash",
    "google": "gemini-2.5-flash",
    "openrouter": "openai/gpt-4o-mini",
}

# Providers whose model names are interchangeable, so the instance default carries over.
_LOCAL_OPENAI_WIRE = frozenset({"ollama", "vllm", "openai-compatible"})
_GEMINI = frozenset({"gemini", "google"})

# Caller-supplied provider keys are tried in this order when the request names
# no provider and the instance default has no key of its own to fall back on.
_CALLER_KEY_PRIORITY = ("anthropic", "openai", "gemini", "openrouter")


def _same_family(a: str, b: str) -> bool:
    if a == b:
        return True
    return (a in _LOCAL_OPENAI_WIRE and b in _LOCAL_OPENAI_WIRE) or (a in _GEMINI and b in _GEMINI)


def _instance_has_key(provider: str, provider_base_urls: dict[str, str] | None = None) -> bool:
    if provider == "anthropic":
        return bool(settings.anthropic_api_key)
    if provider in _GEMINI:
        return bool(settings.gemini_api_key or settings.google_api_key)
    if provider == "openrouter":
        return bool(settings.openrouter_api_key)
    if provider in _LOCAL_OPENAI_WIRE:
        return bool(settings.openai_compatible_base_url) or bool((provider_base_urls or {}).get(provider))
    if provider == "openai":
        return bool(settings.openai_api_key or settings.openai_compatible_base_url)
    return False


def _auto_pick_caller_provider(provider_keys: dict[str, str] | None) -> str | None:
    """The first configured caller key, in priority order, or None if the caller stored none."""
    if not provider_keys:
        return None
    for candidate in _CALLER_KEY_PRIORITY:
        if provider_keys.get(candidate):
            return candidate
    return None


def _has_usable_credential(
    provider: str,
    provider_keys: dict[str, str] | None,
    provider_base_urls: dict[str, str] | None,
) -> bool:
    """Whether `provider` could actually be called: a caller key/base-url, or the instance's own."""
    if (provider_keys or {}).get(provider) or (provider_base_urls or {}).get(provider):
        return True
    return _instance_has_key(provider, provider_base_urls)


def _model_for_provider(
    provider: str, provider_models: dict[str, str] | None, default_provider: str
) -> str:
    """The model a fallback candidate uses. Never the failed provider's model — a name like
    `gpt-4o-mini` means nothing to Anthropic — so this ignores the original request's explicit
    `model` and re-derives one the same way `_resolve` would for a request naming this provider."""
    caller_model = (provider_models or {}).get(provider)
    if caller_model:
        return caller_model
    if _same_family(provider, default_provider):
        return settings.helix_llm_model
    return DEFAULT_MODELS[provider]


def _fallback_candidates(
    current: str,
    provider_keys: dict[str, str] | None,
    provider_base_urls: dict[str, str] | None,
) -> list[str]:
    """Remaining providers to try, in `_CALLER_KEY_PRIORITY` order, skipping `current` and anything
    with no usable credential. Order matches `_auto_pick_caller_provider` so the same caller
    preference governs both the initial pick and every hop after it. This only excludes the
    provider just tried, not the full attempt history — the caller (`call_structured`'s loop)
    re-filters this list against its complete `tried` set before selecting the next provider."""
    return [
        candidate
        for candidate in _CALLER_KEY_PRIORITY
        if candidate != current and _has_usable_credential(candidate, provider_keys, provider_base_urls)
    ]


def _resolve(
    model: str | None,
    provider: str | None = None,
    provider_keys: dict[str, str] | None = None,
    provider_models: dict[str, str] | None = None,
    provider_base_urls: dict[str, str] | None = None,
) -> tuple[str, str]:
    """The provider and model this request will use.

    When the request names no provider and the instance's default provider has
    no key configured, a caller who supplied their own provider keys has one
    picked for them (anthropic, then openai, then gemini, then openrouter)
    rather than failing on missing instance credentials the caller has already
    worked around. A caller-supplied base URL for a local runtime counts as
    that provider being usable, the same as an instance-wide one.
    """
    default_provider = settings.helix_llm_provider.lower()
    resolved_provider = (provider or default_provider).lower()

    if provider is None and not _instance_has_key(default_provider, provider_base_urls):
        auto = _auto_pick_caller_provider(provider_keys)
        if auto is not None:
            resolved_provider = auto
            if model:
                return resolved_provider, model
            caller_model = (provider_models or {}).get(auto)
            return resolved_provider, caller_model or DEFAULT_MODELS[auto]

    if model:
        return resolved_provider, model

    if provider_models and provider_models.get(resolved_provider):
        return resolved_provider, provider_models[resolved_provider]

    if _same_family(resolved_provider, default_provider):
        return resolved_provider, settings.helix_llm_model

    fallback = DEFAULT_MODELS.get(resolved_provider)
    if fallback is None:
        raise RequestError(
            f"`model` is required with provider \"{resolved_provider}\": this instance's default "
            f"model belongs to \"{default_provider}\" and there is no standard model for a local runtime.",
            field="model",
        )
    return resolved_provider, fallback


def _openai_wire_credentials(
    provider: str, caller_key: str | None = None, caller_base_url: str | None = None
) -> tuple[str, str | None]:
    """Key and base URL for a provider that speaks the OpenAI wire format.

    Each provider reads its own settings: OpenRouter's key must never be sent to
    api.openai.com, and a local runtime's base URL must not be borrowed by a
    request that asked for OpenAI. `caller_key`, when given, overrides the
    instance's own credential for that provider. For a local runtime,
    `caller_base_url` is preferred over the instance-wide
    OPENAI_COMPATIBLE_BASE_URL, since a caller who stored their own Ollama or
    vLLM address wants their own runtime called, not the operator's; the call
    only fails when neither is set.
    """
    if provider == "openrouter":
        if caller_key:
            return caller_key, settings.openrouter_base_url
        if not settings.openrouter_api_key:
            raise ProviderError("OPENROUTER_API_KEY is not set.", fallback_eligible=True)
        return settings.openrouter_api_key, settings.openrouter_base_url

    if provider in _LOCAL_OPENAI_WIRE:
        base_url = caller_base_url or settings.openai_compatible_base_url
        if not base_url:
            raise ProviderError(
                f"No base URL configured for provider \"{provider}\"; store one or set "
                "OPENAI_COMPATIBLE_BASE_URL.",
                fallback_eligible=True,
            )
        # A local runtime needs no real key, but the SDK requires the field.
        return caller_key or settings.openai_compatible_api_key or "not-needed", base_url

    if caller_key:
        return caller_key, settings.openai_base_url
    if settings.openai_api_key:
        return settings.openai_api_key, settings.openai_base_url
    if settings.openai_compatible_base_url:
        return settings.openai_compatible_api_key or "not-needed", settings.openai_compatible_base_url
    raise ProviderError(
        "No LLM credentials configured. Set OPENAI_API_KEY, or point "
        "OPENAI_COMPATIBLE_BASE_URL at a local runtime.",
        fallback_eligible=True,
    )


async def _call_openai(
    content: str,
    schema: dict[str, Any],
    prompt: str | None,
    model: str,
    *,
    provider: str = "openai",
    caller_key: str | None = None,
    caller_base_url: str | None = None,
) -> ExtractionResult:
    from openai import AsyncOpenAI

    key, url = _openai_wire_credentials(provider, caller_key, caller_base_url)
    client = AsyncOpenAI(api_key=key, base_url=url) if url else AsyncOpenAI(api_key=key)

    # OpenAI reports only a cache READ count (`prompt_tokens_details.cached_tokens`);
    # there is no separate write charge on this wire format, so writes stay 0.
    cache_read = 0

    async def run() -> tuple[dict[str, Any], int, int, str]:
        nonlocal cache_read
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"{prompt}\n\n{content}" if prompt else content},
            ],
            response_format=compile_openai(schema),
        )
        choice = response.choices[0]
        raw = choice.message.content or "{}"
        usage = response.usage
        details = getattr(usage, "prompt_tokens_details", None)
        cache_read = getattr(details, "cached_tokens", 0) or 0
        return (
            json.loads(raw),
            usage.prompt_tokens if usage else 0,
            usage.completion_tokens if usage else 0,
            response.model,
        )

    outcome = await call_structured(provider, model, run)
    return ExtractionResult(
        data=outcome.data,
        tokens_input=outcome.tokens_input,
        tokens_output=outcome.tokens_output,
        model_used=outcome.model_used,
        tokens_cache_read=cache_read,
        tokens_cache_write=0,
        cost_usd=price_cost_usd(
            provider,
            outcome.model_used,
            PricingUsage(
                tokens_input=outcome.tokens_input,
                tokens_output=outcome.tokens_output,
                tokens_cache_read=cache_read,
            ),
        ),
    )


async def _call_anthropic(
    content: str,
    schema: dict[str, Any],
    prompt: str | None,
    model: str,
    *,
    caller_key: str | None = None,
) -> ExtractionResult:
    from anthropic import AsyncAnthropic

    api_key = caller_key or settings.anthropic_api_key
    if not api_key:
        raise ProviderError("ANTHROPIC_API_KEY is not set.", fallback_eligible=True)

    client = AsyncAnthropic(api_key=api_key)
    use_output_format = _anthropic_supports_output_format()
    compiled = None if use_output_format else compile_anthropic(schema)

    # Populated only when the request set `cache_control` (not currently the
    # case here); absent on a plain call, so both default to 0 rather than None.
    cache_read = 0
    cache_write = 0

    async def run() -> tuple[dict[str, Any], int, int, str]:
        nonlocal cache_read, cache_write
        kwargs: dict[str, Any] = dict(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"{prompt}\n\n{content}" if prompt else content}],
        )
        if use_output_format:
            kwargs["output_config"] = {"format": compile_anthropic_output_format(schema)}
        else:
            assert compiled is not None
            kwargs["tools"] = compiled["tools"]
            kwargs["tool_choice"] = compiled["tool_choice"]

        response = await client.messages.create(**kwargs)
        cache_read = getattr(response.usage, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(response.usage, "cache_creation_input_tokens", 0) or 0

        if use_output_format:
            text = next((b.text for b in response.content if getattr(b, "type", None) == "text"), None)
            if text is None:
                raise SchemaError(
                    f"anthropic ({response.model}) returned no text content for a structured-output request "
                    f"(stop_reason: {response.stop_reason})."
                )
            try:
                data = json.loads(text)
            except json.JSONDecodeError as exc:
                raise SchemaError(
                    f"anthropic ({response.model}) returned text that was not valid JSON for a "
                    "structured-output request."
                ) from exc
        else:
            # Auto tool choice plus a system-prompt instruction, not a forced
            # tool_choice (a 400 on Claude Fable 5.1) — so a model can still
            # answer in text instead of calling the tool; that is a content
            # failure (the model's own answer), not a transport one, so it
            # must not trigger cross-provider fallback.
            data = None
            for block in response.content:
                if getattr(block, "type", None) == "tool_use":
                    data = dict(getattr(block, "input", {}))
                    break
            if data is None:
                raise SchemaError(
                    f"anthropic ({response.model}) did not call the \"extract\" tool "
                    f"(stop_reason: {response.stop_reason})."
                )

        return data, response.usage.input_tokens, response.usage.output_tokens, response.model

    outcome = await call_structured("anthropic", model, run)
    return ExtractionResult(
        data=outcome.data,
        tokens_input=outcome.tokens_input,
        tokens_output=outcome.tokens_output,
        model_used=outcome.model_used,
        tokens_cache_read=cache_read,
        tokens_cache_write=cache_write,
        cost_usd=price_cost_usd(
            "anthropic",
            outcome.model_used,
            PricingUsage(
                tokens_input=outcome.tokens_input,
                tokens_output=outcome.tokens_output,
                tokens_cache_read=cache_read,
                tokens_cache_write=cache_write,
            ),
        ),
    )


async def _call_gemini(
    content: str,
    schema: dict[str, Any],
    prompt: str | None,
    model: str,
    *,
    caller_key: str | None = None,
) -> ExtractionResult:
    from google import genai
    from google.genai import types

    api_key = caller_key or settings.gemini_api_key or settings.google_api_key
    if not api_key:
        raise ProviderError("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.", fallback_eligible=True)

    client = genai.Client(api_key=api_key)

    # Gemini reports only a cache READ count; there is no separate write
    # charge reported back to the caller, so writes stay 0.
    cache_read = 0

    async def run() -> tuple[dict[str, Any], int, int, str]:
        nonlocal cache_read
        response = await client.aio.models.generate_content(
            model=model,
            contents=f"{prompt}\n\n{content}" if prompt else content,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=compile_gemini(schema),
            ),
        )
        usage = getattr(response, "usage_metadata", None)
        cache_read = getattr(usage, "cached_content_token_count", 0) or 0
        return (
            json.loads(response.text or "{}"),
            getattr(usage, "prompt_token_count", 0) or 0,
            getattr(usage, "candidates_token_count", 0) or 0,
            model,
        )

    outcome = await call_structured(provider="gemini", model=model, call=run)
    return ExtractionResult(
        data=outcome.data,
        tokens_input=outcome.tokens_input,
        tokens_output=outcome.tokens_output,
        model_used=outcome.model_used,
        tokens_cache_read=cache_read,
        tokens_cache_write=0,
        cost_usd=price_cost_usd(
            "gemini",
            outcome.model_used,
            PricingUsage(
                tokens_input=outcome.tokens_input,
                tokens_output=outcome.tokens_output,
                tokens_cache_read=cache_read,
            ),
        ),
    )


async def _dispatch(
    provider: str,
    resolved_model: str,
    content: str,
    schema: dict[str, Any],
    prompt: str | None,
    caller_key: str | None,
    caller_base_url: str | None,
) -> ExtractionResult:
    if provider == "anthropic":
        return await _call_anthropic(content, schema, prompt, resolved_model, caller_key=caller_key)
    if provider in _GEMINI:
        return await _call_gemini(content, schema, prompt, resolved_model, caller_key=caller_key)
    if provider == "openai" or provider == "openrouter" or provider in _LOCAL_OPENAI_WIRE:
        return await _call_openai(
            content,
            schema,
            prompt,
            resolved_model,
            provider=provider,
            caller_key=caller_key,
            caller_base_url=caller_base_url,
        )
    raise ProviderError(f"Unknown provider: {provider}")


# Total providers a single call will try, the resolved one plus fallback hops.
MAX_PROVIDERS = 3


async def extract_structured(
    content: str,
    schema: dict[str, Any],
    prompt: str | None = None,
    model: str | None = None,
    max_input_tokens: int = 8_000,
    provider: str | None = None,
    include_sources: bool = False,
    provider_keys: dict[str, str] | None = None,
    provider_models: dict[str, str] | None = None,
    provider_base_urls: dict[str, str] | None = None,
) -> ExtractionResult:
    """Extract structured data using the operator's configured provider.

    `provider_keys` carries a caller's own credentials, decrypted, keyed by
    provider name; when the provider ultimately used has one, it overrides the
    instance's environment credential for that call. `provider_base_urls` is
    the same idea for a local runtime's address. Content is relevance-trimmed
    first. Sending a whole page costs more and scores worse, because the
    fields being asked about end up buried in the middle where attention is
    weakest.

    When the resolved provider fails with a transport-class error (retries
    exhausted on a 429/5xx/network fault, or a missing/invalid stored key)
    this falls through to the next provider the caller can actually use, in
    `_CALLER_KEY_PRIORITY` order, capped at `MAX_PROVIDERS` total attempts. A
    schema or content failure — the model's own answer — never triggers this;
    neither does a request that pinned an explicit `provider`, since silently
    answering from a provider the caller did not choose is a bigger surprise
    than the failure it would be hiding. Each hop uses only that provider's own
    BYOK key or base URL — never one borrowed from the provider that failed.
    """
    pinned = provider is not None
    resolved_provider, resolved_model = _resolve(
        model, provider, provider_keys, provider_models, provider_base_urls
    )
    default_provider = settings.helix_llm_provider.lower()

    # N of M below is always this call's own selection — one `content` string,
    # one `relevance.select()` result — never a crawl- or batch-level aggregate;
    # callers sum blocks_kept/blocks_total across pages downstream of this
    # return, but nothing summed ever flows back into the notice itself.
    selection = relevance.select(content, schema, prompt, max_tokens=max_input_tokens)
    fenced = wrap(selection.text, origin="page")
    if selection.kept_count and selection.kept_count < selection.total:
        fenced += (
            f"\n\n[content clipped: {selection.kept_count} of {selection.total} blocks "
            "shown by relevance ranking; missing blocks may hold the answer — do not "
            "conclude a value is absent]"
        )
    trimmed = fenced

    fallback_from: list[dict[str, str]] = []
    tried: list[str] = []
    current_provider, current_model = resolved_provider, resolved_model

    while True:
        tried.append(current_provider)
        caller_key = (provider_keys or {}).get(current_provider)
        caller_base_url = (provider_base_urls or {}).get(current_provider)
        try:
            result = await _dispatch(
                current_provider, current_model, trimmed, schema, prompt, caller_key, caller_base_url
            )
            break
        except SchemaError:
            raise
        except Exception as exc:
            if isinstance(exc, ProviderError):
                fallback_eligible = exc.fallback_eligible
                reason = str(exc)
            else:
                # Every SDK has its own exception tree (auth, not-found, rate
                # limit, transport, a runtime answering with something other
                # than JSON). To the caller they are all one thing: the model
                # step failed, and here is why. A raw exception reaching here
                # already survived `call_structured`'s own retry+classify, so
                # it is content-class, not transport — never fallback-eligible.
                reason = describe_failure(current_provider, current_model, exc)
                fallback_eligible = False

            candidates = (
                []
                if pinned or not fallback_eligible or len(tried) >= MAX_PROVIDERS
                else _fallback_candidates(current_provider, provider_keys, provider_base_urls)
            )
            next_provider = next((c for c in candidates if c not in tried), None)
            if next_provider is None:
                if not isinstance(exc, ProviderError):
                    raise ProviderError(reason, fallback_eligible=fallback_eligible) from exc
                raise

            fallback_from.append({"provider": current_provider, "reason": reason})
            current_provider = next_provider
            current_model = _model_for_provider(current_provider, provider_models, default_provider)

    result.blocks_kept = selection.kept_count
    result.blocks_total = selection.total
    result.provider_used = current_provider
    result.fallback_from = fallback_from
    if include_sources:
        result.sources = [
            {"text": block.text, "score": round(block.score, 4), "index": block.index}
            for block in selection.kept
        ]
    return result


__all__ = [
    "DEFAULT_MODELS",
    "ExtractionResult",
    "ProviderError",
    "RequestError",
    "SchemaError",
    "extract_structured",
]
