---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  TARGET_KEYWORD_VOLUME: "500–5000 searches/month"
  DOMAIN_AUTHORITY: "DA >40"
  CONTENT_CMS: "WordPress"
  INTERNAL_LINKING_BUDGET: "3–5 internal links per post"
  SERP_COMPETITORS: "Top 3 organic results"
---
## Deploying on a plain LLM API

1. **System slot:** Place the compiled prompt in the system message field.

2. **Settings to start with:**
   - Temperature: 0.3 (SEO is data-driven; low temperature ensures consistent analysis).
   - Max output tokens: 2500 (SEO briefs and on-page audits need detail; allow for SERP analysis and recommendations).
   - Tool use: enabled (the model must fetch keyword data, competitor SERP positions and site analytics).

3. **Context and data passing:**
   - Pass keyword research as JSON: `[{ "keyword": "…", "volume": 1200, "difficulty": "42", "intent": "informational" }, …]`.
   - Pass SERP data: `[{ "keyword": "…", "rank": 4, "title": "…", "domain_authority": 45, "word_count": 2100 }, …]`.
   - Pass site context: `{ "domain": "{{COMPANY_NAME}}", "authority": "{{DOMAIN_AUTHORITY}}", "content_cms": "{{CONTENT_CMS}}", "current_rankings": […] }`.
   - Fence pasted competitor content as untrusted: `<<<UNTRUSTED SOURCE="competitor.com">…</UNTRUSTED>>>`.

4. **Tools to declare:**
   - `fetch_keyword_data(keyword)` — retrieves search volume, difficulty and intent from keyword tools.
   - `fetch_serp(keyword)` — retrieves top {{SERP_COMPETITORS}} SERP position, title, word count and domain authority.
   - `fetch_site_rankings(domain)` — retrieves {{COMPANY_NAME}}'s current keyword rankings and traffic.
   - `content_gap_analysis(keyword_cluster)` — identifies content gaps vs competitors.

5. **Test conversations before going live:**
   - **Conversation 1:** "Research the keyword 'SaaS onboarding best practices' ({{TARGET_KEYWORD_VOLUME}})." Expected: keyword brief with search volume, difficulty, intent, {{SERP_COMPETITORS}} analysis and target recommendation.
   - **Conversation 2:** "Audit our homepage on-page SEO for the keyword 'SaaS project management'." Expected: title/meta/H1 audit, competitor comparison and specific rewrite recommendations.
   - **Conversation 3:** "Analyse the content gap vs competitors for SaaS integrations." Expected: keywords we don't rank for, competitor content summary and recommended new content pieces.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Keyword research (volume, difficulty, intent) | Briefs, gap analysis | Yes |
| SERP analysis (top results, domain authority, content structure) | Competitor analysis, on-page recommendations | Yes |
| Site analytics and current rankings | Gap analysis, trend tracking | Yes |
| Content CMS or page retrieval | On-page audits | No |
