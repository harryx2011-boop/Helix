"""Tests for system-prompt assembly."""

from __future__ import annotations

from helix_extract.context import UNTRUSTED_CONTENT_BOUNDARY, system_prompt


class TestSystemPrompt:
    def test_extract_includes_the_untrusted_content_boundary(self) -> None:
        prompt = system_prompt("extract")
        assert UNTRUSTED_CONTENT_BOUNDARY in prompt
        assert "Extract the requested fields" in prompt

    def test_schema_design_omits_the_untrusted_content_boundary(self) -> None:
        prompt = system_prompt("schema_design")
        assert UNTRUSTED_CONTENT_BOUNDARY not in prompt
        assert "You design JSON Schemas" in prompt
