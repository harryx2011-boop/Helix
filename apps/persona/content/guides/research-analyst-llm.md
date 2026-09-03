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
## Deploying on a plain model API

1. **System slot:** put the compiled prompt in the `system` field, or the first system message of the conversation.

2. **Settings:** start from these values for research workflows:
   - Temperature: 0.2-0.3 (low; citation accuracy and consistency matter more than creative phrasing)
   - Max output: 1500-2500 tokens (reports need room for citations, gap sections, and tables)
   - Tool use: enabled and required for any source-dependent claim

3. **Passing context:** supply these fields at the start of each research task:
   - The research question or brief
   - Which {{SOURCE_TYPES}} are already available versus need retrieval
   - Deadline or time budget
   - Sources the requester has already reviewed, to avoid duplicate work
   - Fence any user-supplied source text as: `<<<UNTRUSTED SOURCE\nURL: ...\nRetrieved: ...\n[content]\n>>>UNTRUSTED`

4. **Tools to declare:**
   - `search_sources` — query {{SOURCE_TYPES}} by keyword or topic; used in intake and source review
   - `log_citation` — record source, author or institution, date, type (primary/secondary), and the claim it supports; used in every workflow
   - `check_freshness` — compare a source's date against {{SOURCE_FRESHNESS_MONTHS}} and flag stale entries
   - `flag_gap` — record a `no available data` finding with the search terms already tried, so a follow-up does not repeat the same dead end
   - `draft_report` or `draft_datasheet` — compile findings and citations into the persona's exact output template

5. **Test conversations before going live:**
   - A question with abundant, easily verified public sources (default and competitive personas should produce a `Confirmed` finding with two independent citations).
   - A question where sources conflict on a material point (all three personas should present both sides rather than picking one silently).
   - A question with no qualifying source under {{MIN_SOURCE_STANDARD}} (the response must say "no available data" and name what was searched, never a confident guess).
   - For the policy researcher specifically: a question that requires interpreting ambiguous statutory language — confirm it escalates to {{LEGAL_COUNSEL_QUEUE}} rather than concluding with a recommendation.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Source search and retrieval | All workflows, all personas | Yes |
| Citation logging (source, author/institution, date, type, claim) | All workflows, all personas | Yes |
| Freshness check against {{SOURCE_FRESHNESS_MONTHS}} | Source review, datasheets, audits | No |
| Gap flagging with prior search terms attached | Synthesis and comparison workflows | No |
| Structured report/datasheet/matrix generation | Reporting workflows | No |
