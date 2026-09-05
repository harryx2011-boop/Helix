"""Tests for schema compilation across providers."""

from __future__ import annotations

import pytest

from helix_extract.schema_compiler import (
    SchemaError,
    compile_anthropic,
    compile_anthropic_output_format,
    compile_for,
    compile_gemini,
    compile_openai,
    validate_schema,
)

SIMPLE = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "The page title"},
        "price": {"type": "number"},
    },
    "required": ["title"],
}


class TestValidation:
    def test_accepts_an_ordinary_schema(self) -> None:
        validate_schema(SIMPLE)

    @pytest.mark.parametrize("keyword", ["minItems", "maxItems", "minProperties", "maxProperties"])
    def test_rejects_keywords_that_induce_fabrication(self, keyword: str) -> None:
        # A model told to return at least three items invents a third rather
        # than reporting that it found two. Vendors document this as a caveat
        # and pass the request through anyway; refusing is more useful.
        with pytest.raises(SchemaError) as exc:
            validate_schema({"type": "array", keyword: 3})

        assert keyword in str(exc.value)
        assert exc.value.hint

    def test_finds_a_bad_keyword_nested_deep(self) -> None:
        schema = {
            "type": "object",
            "properties": {"items": {"type": "array", "minItems": 5}},
        }

        with pytest.raises(SchemaError) as exc:
            validate_schema(schema)

        assert "properties.items" in exc.value.path

    def test_rejects_a_schema_with_too_many_fields(self) -> None:
        # Accuracy degrades measurably past roughly thirty fields, so this is a
        # quality guard rather than a technical limit.
        schema = {
            "type": "object",
            "properties": {f"field{i}": {"type": "string"} for i in range(35)},
        }

        with pytest.raises(SchemaError) as exc:
            validate_schema(schema)

        assert "split" in exc.value.hint.lower()


class TestOpenAI:
    def test_produces_a_strict_response_format(self) -> None:
        compiled = compile_openai(SIMPLE)

        assert compiled["type"] == "json_schema"
        assert compiled["json_schema"]["strict"] is True

    def test_requires_every_property_and_forbids_extras(self) -> None:
        # Strict mode's own rules, which are stricter than JSON Schema's.
        schema = compile_openai(SIMPLE)["json_schema"]["schema"]

        assert set(schema["required"]) == {"title", "price"}
        assert schema["additionalProperties"] is False

    def test_makes_optional_fields_nullable_rather_than_absent(self) -> None:
        # `price` was not required. Strict mode has no way to express that, so
        # the field becomes nullable — the model can still say "not found".
        schema = compile_openai(SIMPLE)["json_schema"]["schema"]

        assert schema["properties"]["price"]["type"] == ["number", "null"]
        assert schema["properties"]["title"]["type"] == "string"

    def test_leaves_a_free_form_map_open(self) -> None:
        # An object with no declared properties is a free-form map. Stamping
        # `additionalProperties: false` on it forbids every key, which under
        # strict mode makes the field structurally unfillable — the schema
        # designer returned an empty `properties` on every request until this
        # case was excluded.
        compiled = compile_openai(
            {
                "type": "object",
                "properties": {"properties": {"type": "object"}},
                "required": ["properties"],
            }
        )
        field = compiled["json_schema"]["schema"]["properties"]["properties"]

        assert field == {"type": "object"}
        assert "additionalProperties" not in field

    def test_applies_strictness_to_nested_objects(self) -> None:
        nested = {
            "type": "object",
            "properties": {
                "author": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}},
                    "required": ["name"],
                }
            },
            "required": ["author"],
        }

        schema = compile_openai(nested)["json_schema"]["schema"]
        assert schema["properties"]["author"]["additionalProperties"] is False


class TestAnthropic:
    def test_uses_auto_choice_with_a_strict_tool(self) -> None:
        # A forced tool_choice (`{"type": "tool", ...}` or "any") is a 400 on
        # Claude Fable 5.1; strict mode plus auto choice gets schema-valid
        # arguments without forcing the call.
        compiled = compile_anthropic(SIMPLE)

        assert compiled["tool_choice"] == {"type": "auto"}
        assert compiled["tools"][0]["strict"] is True
        assert compiled["tools"][0]["input_schema"] == compile_openai(SIMPLE)["json_schema"]["schema"]

    def test_names_the_tool_consistently(self) -> None:
        compiled = compile_anthropic(SIMPLE, name="pull_data")

        assert compiled["tools"][0]["name"] == "pull_data"

    def test_strictifies_the_input_schema(self) -> None:
        # Same strict-mode compilation OpenAI gets: every property required,
        # optional fields nullable, additionalProperties false.
        compiled = compile_anthropic(SIMPLE)
        schema = compiled["tools"][0]["input_schema"]

        assert set(schema["required"]) == {"title", "price"}
        assert schema["additionalProperties"] is False
        assert schema["properties"]["price"]["type"] == ["number", "null"]

    def test_leaves_a_free_form_map_open(self) -> None:
        # A property-less object is a free-form map; additionalProperties:
        # false on it would make the field structurally unfillable.
        compiled = compile_anthropic(
            {
                "type": "object",
                "properties": {"properties": {"type": "object"}},
                "required": ["properties"],
            }
        )
        field = compiled["tools"][0]["input_schema"]["properties"]["properties"]

        assert field == {"type": "object"}
        assert "additionalProperties" not in field


class TestAnthropicOutputFormat:
    def test_produces_a_json_schema_format_payload(self) -> None:
        compiled = compile_anthropic_output_format(SIMPLE)

        assert compiled["type"] == "json_schema"
        assert compiled["schema"] == compile_anthropic(SIMPLE)["tools"][0]["input_schema"]

    def test_carries_no_tool_or_tool_choice(self) -> None:
        compiled = compile_anthropic_output_format(SIMPLE)

        assert "tools" not in compiled
        assert "tool_choice" not in compiled


class TestGemini:
    def test_uppercases_type_names(self) -> None:
        compiled = compile_gemini(SIMPLE)

        assert compiled["type"] == "OBJECT"
        assert compiled["properties"]["title"]["type"] == "STRING"
        assert compiled["properties"]["price"]["type"] == "NUMBER"

    def test_converts_a_nullable_union_into_a_flag(self) -> None:
        schema = {"type": "object", "properties": {"x": {"type": ["string", "null"]}}}

        compiled = compile_gemini(schema)

        assert compiled["properties"]["x"]["type"] == "STRING"
        assert compiled["properties"]["x"]["nullable"] is True

    def test_drops_keywords_gemini_does_not_understand(self) -> None:
        # Gemini rejects the entire request for one unrecognised keyword, so
        # dropping them is the difference between working and failing.
        schema = {
            "type": "object",
            "properties": {"x": {"type": "string", "pattern": "^a", "format": "email"}},
        }

        compiled = compile_gemini(schema)

        assert "pattern" not in compiled["properties"]["x"]
        assert compiled["properties"]["x"]["type"] == "STRING"

    def test_keeps_descriptions_which_guide_extraction(self) -> None:
        compiled = compile_gemini(SIMPLE)
        assert compiled["properties"]["title"]["description"] == "The page title"


class TestCompileFor:
    @pytest.mark.parametrize(
        "provider", ["openai", "ollama", "vllm", "openrouter", "openai-compatible"]
    )
    def test_routes_openai_compatible_providers_to_one_adapter(self, provider: str) -> None:
        # "OpenAI-compatible" is exactly the claim that this wire format works.
        assert compile_for(provider, SIMPLE)["type"] == "json_schema"

    def test_routes_native_providers_to_their_own_shape(self) -> None:
        assert "tools" in compile_for("anthropic", SIMPLE)
        assert compile_for("gemini", SIMPLE)["type"] == "OBJECT"

    def test_rejects_an_unknown_provider(self) -> None:
        with pytest.raises(SchemaError):
            compile_for("some-other-llm", SIMPLE)
