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
from .provider import ProviderError, RequestError, call_structured, describe_failure
from .schema_compiler import SchemaError, compile_anthropic, compile_gemini, compile_openai
from .settings import settings


SYSTEM_PROMPT = system_prompt("extract")


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
            raise ProviderError("OPENROUTER_API_KEY is not set.")
        return settings.openrouter_api_key, settings.openrouter_base_url

    if provider in _LOCAL_OPENAI_WIRE:
        base_url = caller_base_url or settings.openai_compatible_base_url
        if not base_url:
            raise ProviderError(
                f"No base URL configured for provider \"{provider}\"; store one or set "
                "OPENAI_COMPATIBLE_BASE_URL."
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
        "OPENAI_COMPATIBLE_BASE_URL at a local runtime."
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

    async def run() -> tuple[dict[str, Any], int, int, str]:
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
        raise ProviderError("ANTHROPIC_API_KEY is not set.")

    client = AsyncAnthropic(api_key=api_key)
    compiled = compile_anthropic(schema)

    async def run() -> tuple[dict[str, Any], int, int, str]:
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"{prompt}\n\n{content}" if prompt else content}],
            tools=compiled["tools"],
            tool_choice=compiled["tool_choice"],
        )
        # Forced tool use means the answer arrives as tool input, not as text.
        data: dict[str, Any] = {}
        for block in response.content:
            if getattr(block, "type", None) == "tool_use":
                data = dict(getattr(block, "input", {}))
                break
        return data, response.usage.input_tokens, response.usage.output_tokens, response.model

    outcome = await call_structured("anthropic", model, run)
    return ExtractionResult(
        data=outcome.data,
        tokens_input=outcome.tokens_input,
        tokens_output=outcome.tokens_output,
        model_used=outcome.model_used,
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
        raise ProviderError("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.")

    client = genai.Client(api_key=api_key)

    async def run() -> tuple[dict[str, Any], int, int, str]:
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
    )


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
    """
    provider, resolved_model = _resolve(model, provider, provider_keys, provider_models, provider_base_urls)
    caller_key = (provider_keys or {}).get(provider)
    caller_base_url = (provider_base_urls or {}).get(provider)

    selection = relevance.select(content, schema, prompt, max_tokens=max_input_tokens)
    trimmed = selection.text

    try:
        if provider == "anthropic":
            result = await _call_anthropic(trimmed, schema, prompt, resolved_model, caller_key=caller_key)
        elif provider in _GEMINI:
            result = await _call_gemini(trimmed, schema, prompt, resolved_model, caller_key=caller_key)
        elif provider == "openai" or provider == "openrouter" or provider in _LOCAL_OPENAI_WIRE:
            result = await _call_openai(
                trimmed,
                schema,
                prompt,
                resolved_model,
                provider=provider,
                caller_key=caller_key,
                caller_base_url=caller_base_url,
            )
        else:
            raise ProviderError(f"Unknown provider: {provider}")
    except (ProviderError, SchemaError):
        raise
    except Exception as exc:
        # Every SDK has its own exception tree (auth, not-found, rate limit,
        # transport, a runtime answering with something other than JSON). To the
        # caller they are all one thing: the model step failed, and here is why.
        raise ProviderError(describe_failure(provider, resolved_model, exc)) from exc

    result.blocks_kept = selection.kept_count
    result.blocks_total = selection.total
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
