---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  WCAG_TARGET_LEVEL: "AA"
  WCAG_REFERENCES_URL: "https://www.w3.org/WAI/WCAG22/quickref/"
  ISSUE_TRACKING_URL: "https://jira.example.com/a11y"
  TECH_STACK: "React"
  SUPPORTED_ASSISTIVE_TECH: "NVDA, JAWS, VoiceOver, TalkBack"
  TEST_COVERAGE_URL: "https://docs.example.com/a11y-matrix"
  PRIMARY_MOBILE_PLATFORM: "Both"
  PLAIN_LANGUAGE_GUIDELINES_URL: "https://www.plainlanguage.gov"
  CONTENT_AUDIT_URL: "https://docs.example.com/content"
  TARGET_READING_GRADE: "8"
---
## Deploying on an LLM API

1. Fill the configuration keys above for the variant in use; the default WCAG-audit persona needs {{WCAG_REFERENCES_URL}} and {{TECH_STACK}}, assistive-tech-testing needs {{SUPPORTED_ASSISTIVE_TECH}} and {{TEST_COVERAGE_URL}}, and inclusive-content needs {{PLAIN_LANGUAGE_GUIDELINES_URL}} and {{CONTENT_AUDIT_URL}}. Paste the compiled prompt into the system field of a model at temperature 0.3 and max tokens 2500.

2. For WCAG compliance audits, use temperature 0.2 and max tokens 2000 to maximize precision on criteria citations against {{WCAG_TARGET_LEVEL}}. For assistive-tech-testing reports, keep temperature at 0.3 so tool-specific findings stay literal. For content review and inclusive-language guidance, raise to 0.4 to allow natural rewrites while staying grounded in {{PLAIN_LANGUAGE_GUIDELINES_URL}}.

3. Context for audits includes the URL or component code, the scope (single page, workflow, or product-wide), {{WCAG_TARGET_LEVEL}}, and the browser or platform. For assistive-technology testing, include the feature, the user task, and which of {{SUPPORTED_ASSISTIVE_TECH}} to test against, plus {{PRIMARY_MOBILE_PLATFORM}} for mobile work. For content review, include the raw copy and its surface (marketing, UI label, error message).

4. Declare only the tools this instance actually calls: WCAG reference lookup (required for compliance audits), issue-tracking system (optional, for filing defects to {{ISSUE_TRACKING_URL}}), plain-language guidelines (required for content review), content-and-terminology audit (required for inclusive-language review), and the assistive-tech testing matrix (optional, for AT coverage planning). Never let the model file a ticket without the specific WCAG criterion attached.

5. Test with three conversations before going live: (a) a WCAG {{WCAG_TARGET_LEVEL}} audit that returns a severity-sorted table with a code-level fix per row, (b) a content review that reduces a technical paragraph to {{TARGET_READING_GRADE}} grade level without dropping required legal wording, (c) a screen-reader test report naming the exact {{SUPPORTED_ASSISTIVE_TECH}} tool and browser combination used.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| WCAG reference (read) | Compliance audit, default variant | Yes |
| Issue tracking system | Defect filing, default variant | No |
| Assistive tech testing matrix (read) | AT coverage planning | No |
| Plain language guidelines (read) | Content review, inclusive-content variant | Yes |
| Content and terminology audit (read) | Inclusive language review | Yes |

## Notes on the three variants

- **Default**: the code-fix generator. Set {{TECH_STACK}} accurately; its before/after code blocks are only useful if they match the framework the engineers actually use.
- **Assistive Tech Testing**: reports on real tool behavior, not a simulation. It should never be deployed without an actual {{SUPPORTED_ASSISTIVE_TECH}} instance available to the tester; without one, every finding must be labeled simulated, which weakens its value.
- **Inclusive Content**: a copy editor, not a code reviewer. Keep it off code-review surfaces; route it to documentation and marketing-copy workflows where {{PLAIN_LANGUAGE_GUIDELINES_URL}} and {{CONTENT_AUDIT_URL}} are the relevant references.
