"""Grounding verification: what survives, what is dropped, and why."""

from __future__ import annotations

from fastapi.testclient import TestClient

from helix_extract.enrich import MIN_CITATION_CHARS, normalise, value_in_citation, verify_fields
from helix_extract.main import app

client = TestClient(app)

CONTENT = (
    "<<<HELIX_UNTRUSTED origin=\"https://acme.example/about\"\n"
    "Acme Robotics is headquartered in Rotterdam, the Netherlands. The company was "
    "founded in 2011 and employs 240 people. We are hiring across engineering.\n"
    ">>>HELIX_UNTRUSTED"
)


def claim(value, citation):
    return {"value": value, "citation": citation}


class TestNormalisation:
    def test_folds_punctuation_without_folding_words(self):
        assert normalise("The  “Company” is in Rotterdam—NL") == normalise(
            'the "company" is in rotterdam-nl'
        )
        assert normalise("Rotterdam") != normalise("Amsterdam")

    def test_leaves_real_text_intact(self):
        assert len(normalise(CONTENT)) > 100


class TestGroundedFieldsSurvive:
    def test_accepts_a_value_quoted_from_the_content(self):
        [verdict] = verify_fields(
            CONTENT,
            {"hq": claim("Rotterdam", "Acme Robotics is headquartered in Rotterdam, the Netherlands.")},
        )
        assert verdict.grounded is True
        assert verdict.value == "Rotterdam"
        assert verdict.reason is None
        assert verdict.value_in_citation is True

    def test_accepts_a_citation_retyped_with_different_case_and_spacing(self):
        [verdict] = verify_fields(
            CONTENT,
            {"hq": claim("Rotterdam", "acme robotics is  headquartered in ROTTERDAM, the netherlands")},
        )
        assert verdict.grounded is True

    def test_accepts_a_number_the_page_wrote_with_separators(self):
        content = "Annual recurring revenue reached 1,200,000 euro in the last financial year."
        [verdict] = verify_fields(
            content, {"arr": claim(1200000, "Annual recurring revenue reached 1,200,000 euro")}
        )
        assert verdict.grounded is True


class TestUngroundedFieldsAreDropped:
    def test_drops_a_citation_that_is_not_in_the_content(self):
        [verdict] = verify_fields(
            CONTENT,
            {"hq": claim("Berlin", "Acme Robotics is headquartered in Berlin, Germany, since 2011.")},
        )
        assert verdict.grounded is False
        assert verdict.reason == "citation_not_in_content"
        assert verdict.value is None

    def test_drops_a_real_passage_carrying_a_value_it_does_not_state(self):
        [verdict] = verify_fields(
            CONTENT,
            {"hq": claim("Berlin", "Acme Robotics is headquartered in Rotterdam, the Netherlands.")},
        )
        assert verdict.reason == "value_not_in_citation"
        assert verdict.value is None

    def test_drops_a_value_with_no_citation(self):
        [verdict] = verify_fields(CONTENT, {"hq": claim("Rotterdam", "")})
        assert verdict.reason == "no_citation"

    def test_drops_a_citation_too_short_to_identify_itself(self):
        [verdict] = verify_fields(CONTENT, {"hq": claim("Rotterdam", "Rotterdam")})
        assert verdict.reason == "citation_too_short"
        assert len(normalise("Rotterdam")) < MIN_CITATION_CHARS

    def test_drops_a_passage_the_trimmer_removed_even_though_it_is_on_the_page(self):
        # The blind spot this module exists to cover: the gateway would find this
        # passage in the fetched page, but it never reached the model.
        trimmed = "<<<HELIX_UNTRUSTED origin=\"https://acme.example/\"\nAcme Robotics builds warehouse automation.\n>>>HELIX_UNTRUSTED"
        [verdict] = verify_fields(
            trimmed,
            {"hq": claim("Rotterdam", "Acme Robotics is headquartered in Rotterdam, the Netherlands.")},
        )
        assert verdict.reason == "citation_not_in_content"


class TestNoDataIsNotAFailure:
    def test_a_null_value_is_reported_without_a_rejection_reason(self):
        [verdict] = verify_fields(CONTENT, {"hq": claim(None, "")})
        assert verdict.grounded is False
        assert verdict.reason is None
        assert verdict.value is None

    def test_a_missing_claim_object_is_treated_the_same_way(self):
        [verdict] = verify_fields(CONTENT, {"hq": "not an object"})
        assert verdict.reason is None
        assert verdict.grounded is False


class TestBooleans:
    def test_a_boolean_grounds_on_a_real_passage_and_is_marked_unconfirmed(self):
        [verdict] = verify_fields(
            CONTENT, {"hiring": claim(True, "We are hiring across engineering.")}
        )
        assert verdict.grounded is True
        assert verdict.value is True
        assert verdict.value_in_citation is False

    def test_a_boolean_still_needs_a_real_passage(self):
        [verdict] = verify_fields(
            CONTENT, {"hiring": claim(True, "The company has frozen all hiring indefinitely this year.")}
        )
        assert verdict.reason == "citation_not_in_content"

    def test_value_in_citation_is_false_for_a_boolean(self):
        assert value_in_citation(True, "We are hiring across engineering.") is False


class TestVerifyEndpoint:
    def test_returns_a_verdict_per_field_with_counts(self):
        response = client.post(
            "/enrich/verify",
            json={
                "content": CONTENT,
                "claims": {
                    "hq": claim("Rotterdam", "Acme Robotics is headquartered in Rotterdam, the Netherlands."),
                    "invented": claim("Berlin", "Acme Robotics is headquartered in Berlin, Germany, since 2011."),
                    "absent": claim(None, ""),
                },
            },
        )

        assert response.status_code == 200
        body = response.json()
        by_name = {f["name"]: f for f in body["fields"]}

        assert by_name["hq"]["grounded"] is True
        assert by_name["hq"]["value"] == "Rotterdam"
        assert by_name["invented"]["grounded"] is False
        assert by_name["invented"]["value"] is None
        assert by_name["invented"]["reason"] == "citation_not_in_content"
        assert by_name["absent"]["reason"] is None

        assert body["grounded_count"] == 1
        assert body["rejected_count"] == 1

    def test_rejects_a_request_with_no_content_field(self):
        assert client.post("/enrich/verify", json={"claims": {}}).status_code == 422

    def test_an_empty_claim_set_is_valid_and_grounds_nothing(self):
        body = client.post("/enrich/verify", json={"content": CONTENT, "claims": {}}).json()
        assert body == {"fields": [], "grounded_count": 0, "rejected_count": 0}
