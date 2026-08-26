"""Turns a plain-language description of wanted data into a JSON Schema.

The dashboard's Agent research preview lets someone describe what they want in
prose; this module asks the operator's configured model to design the
extraction schema for it, so the result can be handed straight to
`jsonOptions.schema` on `/scrape` and `/search`.

This is schema design, not extraction: the model is producing a JSON Schema
*object*, not data conforming to one. It still goes through each provider's
structured-output mechanism, with a meta-schema (a schema describing valid
JSON Schemas) as the target shape, so the same guarantee of well-formed JSON
applies here as it does to `/structured`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .llm import (
    ProviderError,
    _describe_failure,
    _openai_wire_credentials,
    _resolve,
)
from .schema_compiler import SchemaError, compile_anthropic, compile_gemini, compile_openai

# A schema for schemas: loose enough to admit any valid JSON Schema object, but
# it pins down the shape a model reaches for reliably (object/array/properties)
# rather than leaving the field wide open to unstructured text.
META_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["object"]},
        "properties": {"type": "object"},
        "required": {"type": "array", "items": {"type": "string"}},
        "description": {"type": "string"},
    },
    "required": ["type", "properties"],
}

SYSTEM_PROMPT = (
    "You design JSON Schemas for web-data extraction. Given a description of the "
    "data someone wants pulled from a web page, produce a strict JSON Schema: "
    "`type` is always \"object\"; every field in `properties` has a `description` "
    "explaining what to extract; a field that is a list of records is `type: "
    "array` with `items` as a nested object schema; use `enum` when the request "
    "names a fixed set of categories or options; mark fields that must be "
    "present in `required`. Do not use minItems, maxItems, minProperties or "
    "maxProperties — these cause models to invent data to satisfy them. "
    "Return only the schema."
)

REPAIR_SUFFIX = (
    "\n\nThe previous answer was not a valid JSON Schema object (it needs a "
    "top-level \"type\": \"object\" and a \"properties\" object). Return a "
    "corrected schema."
)


@dataclass
class SchemaGenResult:
    schema: dict[str, Any]
    summary: str
    tokens_input: int
    tokens_output: int
    model_used: str


def _user_prompt(prompt: str, urls: list[str] | None, hint: dict[str, Any] | None, instruction: str | None) -> str:
    parts = [f"Data to extract: {prompt}"]
    if urls:
        parts.append("Example URLs this will run against:\n" + "\n".join(urls))
    if hint:
        parts.append("Previous schema to refine:\n" + json.dumps(hint))
    if instruction:
        parts.append(f"Refinement instructions: {instruction}")
    return "\n\n".join(parts)


def _is_usable_schema(candidate: Any) -> bool:
    return (
        isinstance(candidate, dict)
        and candidate.get("type") == "object"
        and isinstance(candidate.get("properties"), dict)
    )


async def _call_openai_json(
    user_prompt: str, model: str, *, provider: str = "openai", caller_key: str | None = None
) -> tuple[dict[str, Any], int, int, str]:
    from openai import AsyncOpenAI

    key, url = _openai_wire_credentials(provider, caller_key)
    client = AsyncOpenAI(api_key=key, base_url=url) if url else AsyncOpenAI(api_key=key)

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format=compile_openai(META_SCHEMA, name="schema_design"),
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


async def _call_anthropic_json(
    user_prompt: str, model: str, *, caller_key: str | None = None
) -> tuple[dict[str, Any], int, int, str]:
    from anthropic import AsyncAnthropic

    from .settings import settings

    api_key = caller_key or settings.anthropic_api_key
    if not api_key:
        raise ProviderError("ANTHROPIC_API_KEY is not set.")

    client = AsyncAnthropic(api_key=api_key)
    compiled = compile_anthropic(META_SCHEMA, name="schema_design")

    response = await client.messages.create(
        model=model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
        tools=compiled["tools"],
        tool_choice=compiled["tool_choice"],
    )

    data: dict[str, Any] = {}
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            data = dict(getattr(block, "input", {}))
            break

    return data, response.usage.input_tokens, response.usage.output_tokens, response.model


async def _call_gemini_json(
    user_prompt: str, model: str, *, caller_key: str | None = None
) -> tuple[dict[str, Any], int, int, str]:
    from google import genai
    from google.genai import types

    from .settings import settings

    api_key = caller_key or settings.gemini_api_key or settings.google_api_key
    if not api_key:
        raise ProviderError("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.")

    client = genai.Client(api_key=api_key)

    response = await client.aio.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=compile_gemini(META_SCHEMA),
        ),
    )

    usage = getattr(response, "usage_metadata", None)
    return (
        json.loads(response.text or "{}"),
        getattr(usage, "prompt_token_count", 0) or 0,
        getattr(usage, "candidates_token_count", 0) or 0,
        model,
    )


_GEMINI_PROVIDERS = frozenset({"gemini", "google"})
_LOCAL_OPENAI_WIRE = frozenset({"ollama", "vllm", "openai-compatible"})


async def _run(
    user_prompt: str, provider: str, model: str, caller_key: str | None = None
) -> tuple[dict[str, Any], int, int, str]:
    if provider == "anthropic":
        return await _call_anthropic_json(user_prompt, model, caller_key=caller_key)
    if provider in _GEMINI_PROVIDERS:
        return await _call_gemini_json(user_prompt, model, caller_key=caller_key)
    if provider == "openai" or provider == "openrouter" or provider in _LOCAL_OPENAI_WIRE:
        return await _call_openai_json(user_prompt, model, provider=provider, caller_key=caller_key)
    raise ProviderError(f"Unknown provider: {provider}")


def _summarise(schema: dict[str, Any]) -> str:
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        return "An empty schema."
    names = list(properties.keys())
    shown = ", ".join(names[:6])
    more = f" and {len(names) - 6} more" if len(names) > 6 else ""
    return f"Extracts {len(names)} field{'s' if len(names) != 1 else ''}: {shown}{more}."


async def generate_schema(
    prompt: str,
    urls: list[str] | None = None,
    hint: dict[str, Any] | None = None,
    instruction: str | None = None,
    model: str | None = None,
    provider: str | None = None,
    provider_keys: dict[str, str] | None = None,
    provider_models: dict[str, str] | None = None,
) -> SchemaGenResult:
    """Design a JSON Schema for the data described in `prompt`.

    `provider_keys` carries a caller's own credentials, decrypted, keyed by
    provider name, the same as `llm.extract_structured`. Raises
    `llm.ProviderError` when no provider is configured or the provider call
    fails, mirroring `/structured`'s error semantics exactly — the dashboard
    treats a schema-generation failure the same way.
    """
    resolved_provider, resolved_model = _resolve(model, provider, provider_keys, provider_models)
    caller_key = (provider_keys or {}).get(resolved_provider)
    user_prompt = _user_prompt(prompt, urls, hint, instruction)

    try:
        schema, tokens_input, tokens_output, model_used = await _run(
            user_prompt, resolved_provider, resolved_model, caller_key
        )
    except (ProviderError, SchemaError):
        raise
    except Exception as exc:
        raise ProviderError(_describe_failure(resolved_provider, resolved_model, exc)) from exc

    if not _is_usable_schema(schema):
        # One repair attempt: re-prompt with the failure named, rather than
        # failing outright on a model that returned close-but-not-quite JSON.
        try:
            schema, repair_input, repair_output, model_used = await _run(
                user_prompt + REPAIR_SUFFIX, resolved_provider, resolved_model, caller_key
            )
            tokens_input += repair_input
            tokens_output += repair_output
        except (ProviderError, SchemaError):
            raise
        except Exception as exc:
            raise ProviderError(_describe_failure(resolved_provider, resolved_model, exc)) from exc

        if not _is_usable_schema(schema):
            raise ProviderError(
                f"{resolved_provider} ({model_used}) did not return a usable JSON Schema after a repair attempt."
            )

    return SchemaGenResult(
        schema=schema,
        summary=_summarise(schema),
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        model_used=model_used,
    )


__all__ = ["SchemaGenResult", "generate_schema"]
