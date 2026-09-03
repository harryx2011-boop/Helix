---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  SOURCE_LANGUAGE: "English"
  TARGET_LANGUAGE: "Spanish"
  GLOSSARY_URL: "https://docs.example.com/glossary"
  LOCALE_RULES_URL: "https://docs.example.com/locales"
  REGULATORY_DOCS_URL: "https://docs.example.com/compliance"
  MARKET_RESEARCH_URL: "https://research.example.com/regions"
  DOMAIN_AREAS: "Billing, Dashboard, Analytics, Reporting"
---
## Deploying in a localization workflow

1. Fill the configuration keys above. Point to your glossary database, locale formatting rules, regulatory guidance and market research. The agent uses these as the authoritative reference for every translation and adaptation decision.

2. For translation requests, paste the {{SOURCE_LANGUAGE}} text, provide context (UI component, page heading, tooltip) and the target language. The agent will translate using the glossary and apply locale-specific formatting (date order, currency, address layout).

3. For consistency audits, provide the domain area and the existing translations or strings to check. The agent will verify consistency against the glossary and report drift.

4. For regional adaptation, specify the target region and provide the product description or feature set. The agent will audit for regulatory compliance and market fit against local expectations.

5. Test with three workflows before going live: (a) translate 10 UI strings that produce consistent terminology per the glossary, (b) audit existing translations and identify 2–3 inconsistencies, (c) regional-compliance check for a target region that identifies at least one required change.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Glossary lookup | All translation | Yes |
| Locale rules | Date, currency, address formatting | Yes |
| Regulatory compliance database | Regional adaptation | No |
| Market research database | Regional adaptation and competitive positioning | No |
