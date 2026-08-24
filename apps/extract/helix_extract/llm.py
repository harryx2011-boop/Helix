"""LLM providers, bring-your-own-key.

Helix never bundles a model. The operator configures a provider through the
environment, the call goes to their account, and their provider bills them.
There is no margin on inference here — which also means no incentive to be
vague about retries or failures.

Native adapters exist where the structured-output mechanism genuinely differs:
OpenAI, Anthropic and Gemini. Everything else — Ollama, vLLM, OpenRouter,
LM Studio — speaks the OpenAI wire format, so one adapter covers them all.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from . import relevance
from .schema_compiler import SchemaError, compile_anthropic, compile_gemini, compile_openai
from .settings import settings


@dataclass
class ExtractionResult:
    data: dict[str, Any]
    tokens_input: int
    tokens_output: int
    model_used: str
    blocks_kept: int = 0
    blocks_total: int = 0


class ProviderError(RuntimeError):
    """A provider call failed, or none was configured."""


def _resolve(model: str | None) -> tuple[str, str]:
    """The provider and model this request will use."""
    provider = settings.helix_llm_provider.lower()
    return provider, model or settings.helix_llm_model


async def _call_openai(
    content: str,
    schema: dict[str, Any],
    prompt: str | None,
    model: str,
    *,
    base_url: str | None = None,
    api_key: str | None = None,
) -> ExtractionResult:
    from openai import AsyncOpenAI

    key = api_key or settings.openai_api_key or settings.openai_compatible_api_key
    url = base_url or settings.openai_base_url or settings.openai_compatible_base_url

    # A local runtime needs no real key, but the SDK requires the field.
    if not key and url:
        key = "not-needed"

    if not key:
        raise ProviderError(
            "No LLM credentials configured. Set OPENAI_API_KEY, or point "
            "OPENAI_COMPATIBLE_BASE_URL at a local runtime."
        )

    client = AsyncOpenAI(api_key=key, base_url=url) if url else AsyncOpenAI(api_key=key)

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract the requested fields from the content. Use only what the "
                    "content states. When a field is not present, return null for it "
                    "rather than guessing."
                ),
            },
            {"role": "user", "content": f"{prompt}\n\n{content}" if prompt else content},
        ],
        response_format=compile_openai(schema),
    )

    choice = response.choices[0]
    raw = choice.message.content or "{}"

    return ExtractionResult(
        data=json.loads(raw),
        tokens_input=response.usage.prompt_tokens if response.usage else 0,
        tokens_output=response.usage.completion_tokens if response.usage else 0,
        model_used=response.model,
    )


async def _call_anthropic(
    content: str,
    schema: dict[str, Any],
    prompt: str | None,
    model: str,
) -> ExtractionResult:
    from anthropic import AsyncAnthropic

    if not settings.anthropic_api_key:
        raise ProviderError("ANTHROPIC_API_KEY is not set.")

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    compiled = compile_anthropic(schema)

    response = await client.messages.create(
        model=model,
        max_tokens=4096,
        system=(
            "Extract the requested fields from the content. Use only what the content "
            "states. When a field is not present, return null for it rather than guessing."
        ),
        messages=[
            {"role": "user", "content": f"{prompt}\n\n{content}" if prompt else content}
        ],
        tools=compiled["tools"],
        tool_choice=compiled["tool_choice"],
    )

    # Forced tool use means the answer arrives as tool input, not as text.
    data: dict[str, Any] = {}
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            data = dict(getattr(block, "input", {}))
            break

    return ExtractionResult(
        data=data,
        tokens_input=response.usage.input_tokens,
        tokens_output=response.usage.output_tokens,
        model_used=response.model,
    )


async def _call_gemini(
    content: str,
    schema: dict[str, Any],
    prompt: str | None,
    model: str,
) -> ExtractionResult:
    from google import genai
    from google.genai import types

    if not settings.gemini_api_key:
        raise ProviderError("GEMINI_API_KEY is not set.")

    client = genai.Client(api_key=settings.gemini_api_key)

    response = await client.aio.models.generate_content(
        model=model,
        contents=f"{prompt}\n\n{content}" if prompt else content,
        config=types.GenerateContentConfig(
            system_instruction=(
                "Extract the requested fields from the content. Use only what the "
                "content states. When a field is not present, return null for it "
                "rather than guessing."
            ),
            response_mime_type="application/json",
            response_schema=compile_gemini(schema),
        ),
    )

    usage = getattr(response, "usage_metadata", None)

    return ExtractionResult(
        data=json.loads(response.text or "{}"),
        tokens_input=getattr(usage, "prompt_token_count", 0) or 0,
        tokens_output=getattr(usage, "candidates_token_count", 0) or 0,
        model_used=model,
    )


async def extract_structured(
    content: str,
    schema: dict[str, Any],
    prompt: str | None = None,
    model: str | None = None,
    max_input_tokens: int = 8_000,
) -> ExtractionResult:
    """Extract structured data using the operator's configured provider.

    Content is relevance-trimmed first. Sending a whole page costs more and
    scores worse, because the fields being asked about end up buried in the
    middle where attention is weakest.
    """
    provider, resolved_model = _resolve(model)

    trimmed, kept, total = relevance.trim_to_budget(
        content, schema, prompt, max_tokens=max_input_tokens
    )

    if provider == "anthropic":
        result = await _call_anthropic(trimmed, schema, prompt, resolved_model)
    elif provider in ("gemini", "google"):
        result = await _call_gemini(trimmed, schema, prompt, resolved_model)
    elif provider in ("openai", "openai-compatible", "ollama", "vllm", "openrouter"):
        result = await _call_openai(trimmed, schema, prompt, resolved_model)
    else:
        raise ProviderError(f"Unknown provider: {provider}")

    result.blocks_kept = kept
    result.blocks_total = total
    return result


__all__ = ["ExtractionResult", "ProviderError", "SchemaError", "extract_structured"]
