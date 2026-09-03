---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  SOURCE_LANGUAGE: "English"
  TARGET_LANGUAGE: "Spanish"
  GLOSSARY_URL: "https://docs.example.com/glossary"
  LOCALE_RULES_URL: "https://docs.example.com/locales"
  MAX_STRING_LENGTH_CHARS: "40"
  REGULATORY_DOCS_URL: "https://docs.example.com/compliance"
  MARKET_RESEARCH_URL: "https://research.example.com/regions"
  TARGET_REGION: "Europe"
  LEGAL_CONTACT_EMAIL: "legal@example.com"
  DOMAIN_AREAS: "Billing, Dashboard, Analytics, Reporting"
  DEPRECATION_WINDOW_DAYS: "90"
---
## Deploying on an LLM API

1. Fill the configuration keys above for the variant in use; the default translation persona needs {{GLOSSARY_URL}} and {{LOCALE_RULES_URL}}, regional-adaptation needs {{REGULATORY_DOCS_URL}} and {{MARKET_RESEARCH_URL}}, and terminology-specialist needs {{DOMAIN_AREAS}} and {{DEPRECATION_WINDOW_DAYS}}. Paste the compiled prompt into the system field of a model at temperature 0.2 and max tokens 2000. Low temperature maximizes glossary and locale-rule adherence.

2. For string translation, keep temperature at 0.2 with max tokens scaled to source length (roughly 500-1000). For glossary building or terminology expansion, raise to 0.3 to allow more flexibility in proposing new terms. For regulatory compliance audits, drop to 0.1 so citations stay tightly bound to {{REGULATORY_DOCS_URL}} rather than paraphrased from memory.

3. Context for translation includes the source text in {{SOURCE_LANGUAGE}}, surrounding UI context (button, tooltip, heading), and {{MAX_STRING_LENGTH_CHARS}} when the surface has a hard limit. For regional adaptation, include the feature description and what user data it touches. For terminology work, include the term, its usage context, and any existing translation precedent.

4. Declare only the tools this instance actually calls: glossary lookup (required for translation and terminology work), locale-rules lookup (required for date, currency and address formatting), regulatory-documentation lookup (regional-adaptation variant only), and market-research lookup (regional-adaptation variant only). Route anything requiring {{LEGAL_CONTACT_EMAIL}} sign-off as a flagged output, never as an automatic tool call.

5. Test with three conversations before going live: (a) translate five UI strings that cite {{GLOSSARY_URL}} terms and apply {{LOCALE_RULES_URL}} formatting, (b) run a regulatory-compliance audit for {{TARGET_REGION}} that cites a specific requirement and flags at least one gap, (c) submit a terminology-governance request that produces a deprecation window instead of an instant silent change.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Glossary lookup (read) | Translation, terminology work | Yes |
| Locale rules (read) | Date, currency, address formatting | Yes |
| Regulatory documentation (read) | Regional compliance audit | No |
| Market research (read) | Regional adaptation, positioning | No |
| Legal contact routing | Compliance sign-off | No |

## Notes on the three variants

- **Default**: the string-level translator. Keep {{MAX_STRING_LENGTH_CHARS}} set for any surface with a hard character limit, or the length-flag column in its output will always read "no limit set."
- **Regional Adaptation**: a compliance and market-fit reviewer, not a translator. It needs {{REGULATORY_DOCS_URL}} and {{MARKET_RESEARCH_URL}} wired before launch; without them it can only say "not documented" for every audit row.
- **Terminology Specialist**: owns {{GLOSSARY_URL}} as the source of truth. Do not run it alongside the default variant on the same glossary without a review step — both can propose entries, and only one governance pass should approve them.
