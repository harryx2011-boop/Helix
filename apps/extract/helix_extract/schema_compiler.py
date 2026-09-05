"""One schema representation, compiled to each provider's native mechanism.

Providers converged on schema-constrained decoding but not on how to ask for it:

- **OpenAI** — ``response_format`` with ``json_schema`` and ``strict: true``.
  Requires ``additionalProperties: false`` and every property listed in
  ``required``, which is stricter than JSON Schema itself.
- **Anthropic** — forced tool use. The schema becomes a tool's input schema and
  ``tool_choice`` names it. Not compatible with extended thinking.
- **Gemini** — ``responseSchema``, which supports a subset of JSON Schema and
  uses uppercase type names.

Keeping one internal representation and compiling per provider means a caller
writes a schema once. The alternative — passing raw JSON Schema through and
hoping — is how a request that works on one provider silently degrades on another.

**Constrained decoding guarantees shape, not truth.** A model will happily emit
a well-formed object full of invented values. Length keywords make that worse by
giving it a target to fill, so they are rejected rather than passed along.
"""

from __future__ import annotations

from typing import Any

# Keywords that induce fabrication. A model told to return at least three items
# will invent a third rather than report that it found two.
FABRICATION_KEYWORDS = ("minItems", "maxItems", "minProperties", "maxProperties")


class SchemaError(ValueError):
    """A schema that cannot be compiled, or should not be."""

    def __init__(self, message: str, path: str = "", hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.path = path
        self.hint = hint


def validate_schema(schema: dict[str, Any], path: str = "schema") -> None:
    """Reject schemas that would degrade output quality.

    Called before compilation so the caller gets one clear error rather than a
    provider-specific rejection or, worse, a plausible fabricated answer.
    """
    for keyword in FABRICATION_KEYWORDS:
        if keyword in schema:
            raise SchemaError(
                f"`{keyword}` is not supported in extraction schemas.",
                path=f"{path}.{keyword}",
                hint=(
                    "Length constraints make models invent entries to satisfy them. "
                    "Describe what you expect in the field description instead."
                ),
            )

    properties = schema.get("properties")
    if isinstance(properties, dict):
        if len(properties) > 30:
            raise SchemaError(
                f"This schema has {len(properties)} fields, which measurably degrades accuracy.",
                path=path,
                hint="Split it into two or three requests of 10-15 fields each.",
            )
        for key, value in properties.items():
            if isinstance(value, dict):
                validate_schema(value, f"{path}.properties.{key}")

    items = schema.get("items")
    if isinstance(items, dict):
        validate_schema(items, f"{path}.items")


def _strictify(schema: dict[str, Any]) -> dict[str, Any]:
    """Rewrite a schema to satisfy OpenAI's strict mode.

    Strict mode demands every property be required and additional properties be
    forbidden. Optional fields are expressed by allowing null instead — which
    keeps the caller's intent while satisfying the constraint.
    """
    out = dict(schema)

    # An object that declares no properties is a free-form map, not an empty
    # record. Stamping `additionalProperties: false` on it forbids every key,
    # which under strict mode makes the field structurally unfillable — the
    # model cannot emit content it is not allowed to emit.
    if out.get("type") == "object" and not out.get("properties"):
        return out

    if out.get("type") == "object" or "properties" in out:
        properties = out.get("properties", {})
        compiled: dict[str, Any] = {}

        declared_required = set(out.get("required", []))

        for key, value in properties.items():
            if not isinstance(value, dict):
                compiled[key] = value
                continue

            child = _strictify(value)

            # An optional field becomes nullable rather than absent, so the model
            # can still say "not found" without violating strict mode.
            if key not in declared_required:
                child_type = child.get("type")
                if isinstance(child_type, str):
                    child = {**child, "type": [child_type, "null"]}
                elif isinstance(child_type, list) and "null" not in child_type:
                    child = {**child, "type": [*child_type, "null"]}

            compiled[key] = child

        out["properties"] = compiled
        out["required"] = list(properties.keys())
        out["additionalProperties"] = False

    if isinstance(out.get("items"), dict):
        out["items"] = _strictify(out["items"])

    return out


def compile_openai(schema: dict[str, Any], name: str = "extraction") -> dict[str, Any]:
    """A ``response_format`` payload for the OpenAI Chat Completions API."""
    validate_schema(schema)
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": _strictify(schema),
        },
    }


def compile_anthropic(schema: dict[str, Any], name: str = "extract") -> dict[str, Any]:
    """A strict-tool payload for the Anthropic Messages API, used when the
    installed SDK has no ``output_config.format`` support.

    Forcing ``tool_choice`` (``{"type": "tool", ...}`` or ``"any"``) is a 400 on
    Claude Fable 5.1 and a migration hazard even where it still works — the
    call site uses ``{"type": "auto"}`` instead and relies on ``strict`` for
    schema-valid arguments plus a system-prompt instruction naming the tool.
    """
    validate_schema(schema)
    return {
        "tools": [
            {
                "name": name,
                "description": "Return the extracted data.",
                "input_schema": _strictify(schema),
                "strict": True,
            }
        ],
        "tool_choice": {"type": "auto"},
    }


def compile_anthropic_output_format(schema: dict[str, Any], name: str = "extraction") -> dict[str, Any]:
    """An ``output_config.format`` payload for the Anthropic Messages API.

    Preferred over :func:`compile_anthropic`'s tool trick wherever the
    installed SDK supports it — no tool, no forced choice, just a schema-
    constrained text response.
    """
    validate_schema(schema)
    return {"type": "json_schema", "schema": _strictify(schema)}


# Gemini uses uppercase type names and understands only a subset of JSON Schema.
_GEMINI_TYPES = {
    "string": "STRING",
    "number": "NUMBER",
    "integer": "INTEGER",
    "boolean": "BOOLEAN",
    "array": "ARRAY",
    "object": "OBJECT",
}

_GEMINI_SUPPORTED = {"type", "properties", "items", "required", "description", "enum", "nullable"}


def _to_gemini(schema: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}

    for key, value in schema.items():
        if key not in _GEMINI_SUPPORTED:
            # Silently dropping unknown keywords is correct here: Gemini rejects
            # the whole request for one it does not recognise.
            continue

        if key == "type":
            if isinstance(value, list):
                # A nullable union becomes the base type plus a nullable flag.
                non_null = [t for t in value if t != "null"]
                if non_null:
                    out["type"] = _GEMINI_TYPES.get(non_null[0], "STRING")
                if "null" in value:
                    out["nullable"] = True
            else:
                out["type"] = _GEMINI_TYPES.get(value, "STRING")
        elif key == "properties" and isinstance(value, dict):
            out["properties"] = {
                k: _to_gemini(v) if isinstance(v, dict) else v for k, v in value.items()
            }
        elif key == "items" and isinstance(value, dict):
            out["items"] = _to_gemini(value)
        else:
            out[key] = value

    return out


def compile_gemini(schema: dict[str, Any]) -> dict[str, Any]:
    """A ``responseSchema`` for the Gemini API."""
    validate_schema(schema)
    return _to_gemini(schema)


def compile_for(provider: str, schema: dict[str, Any]) -> dict[str, Any]:
    """Compile for a named provider.

    OpenAI-compatible endpoints (Ollama, vLLM, OpenRouter, LM Studio) take the
    OpenAI shape by definition — that is what compatibility means here.
    """
    normalised = provider.lower()

    if normalised in ("openai", "openai-compatible", "ollama", "vllm", "openrouter"):
        return compile_openai(schema)
    if normalised == "anthropic":
        return compile_anthropic(schema)
    if normalised in ("gemini", "google"):
        return compile_gemini(schema)

    raise SchemaError(f"unknown provider: {provider}")
