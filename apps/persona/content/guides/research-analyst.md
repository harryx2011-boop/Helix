---
config_keys:
  COMPANY_NAME: "Research Lab"
  RESEARCH_DOMAIN: "General research"
  SOURCE_TYPES: "Public sources and provided documents"
  CITATION_FORMAT: "Inline with source name and date"
  SOURCE_FRESHNESS_MONTHS: "12"
  MIN_SOURCE_STANDARD: "Named author or institution, with a publication date"
  RESEARCH_REQUEST_QUEUE: "Research tracker"
  MARKET_SEGMENT: "Software as a Service"
  COMPETITORS_LIST: ""
  COMPARISON_DIMENSIONS: "Pricing, feature set, customer base, company size"
  STRATEGY_REVIEW_QUEUE: "Product strategy team"
  POLICY_AREA: "Regulatory compliance"
  JURISDICTIONS: "Multi-jurisdictional"
  COMPLIANCE_STANDARD: "Standard legal consensus"
  LEGAL_COUNSEL_QUEUE: "General counsel"
---
## Deploying in a research platform

1. Fill the configuration keys above and paste the compiled prompt into the system field of the model that drafts research briefs, comparisons, or compliance analysis.
2. Connect the tools behind {{SOURCE_TYPES}}: web or document search, a citation logger, and, for the competitive and policy personas, access to the specific site or document classes named in their placeholders (competitor sites, official regulatory text).
3. Wire a place for the analyst to write to: {{RESEARCH_REQUEST_QUEUE}} for the default persona, {{STRATEGY_REVIEW_QUEUE}} for the competitive analyst, {{LEGAL_COUNSEL_QUEUE}} for the policy researcher. Escalations must land somewhere a human sees them the same day.
4. Enforce the citation log structurally where possible: require the model to emit a `Sources` block on every report and reject outputs missing one before they reach the requester.
5. Test with three requests before going live: one with abundant, easily sourced evidence; one where sources conflict; one where no qualifying source exists. The third response must say "no available data" rather than produce a plausible-sounding answer. Confirm the failure mode is a named gap, not silence or a confident guess.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Source search and retrieval | All workflows, all personas | Yes |
| Citation logging (source, author/institution, date, type) | All workflows, all personas | Yes |
| Freshness check against {{SOURCE_FRESHNESS_MONTHS}} | Source review and audits | No |
| Structured comparison/matrix builder | Competitive and multi-jurisdiction comparisons | No |
| Primary-document lookup (statute, filing, official text) | Policy researcher, competitive analyst | Yes for those two |
