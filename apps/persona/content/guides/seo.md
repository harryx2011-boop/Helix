---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  TARGET_KEYWORD_VOLUME: "500–5000 searches/month"
  DOMAIN_AUTHORITY: "DA >40"
  CONTENT_CMS: "WordPress"
  INTERNAL_LINKING_BUDGET: "3–5 internal links per post"
  SERP_COMPETITORS: "Top 3 organic results"
---
## Deploying in a content or SEO tool

1. Fill the configuration keys above and substitute into the compiled prompt.
2. Paste the compiled prompt into the system field of your SEO or content platform AI assistant.
3. Give the model access to keyword research tools (Google Trends, SEMrush, Ahrefs, Moz), current website analytics and SERP data for target keywords. Pass competitor URLs so the model can analyse their SERP position and content strategy.
4. Wire the workflow: keyword briefs route to content teams; on-page recommendations go to the editing platform; gap analysis and strategy feed into the content calendar.
5. Test with two scenarios: (1) a competitor suddenly ranks above {{COMPANY_NAME}} on a high-volume keyword (model must flag and recommend refresh), (2) analysing {{TARGET_KEYWORD_VOLUME}} keyword that {{DOMAIN_AUTHORITY}} is borderline for (model must recommend clustering or long-tail strategy).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Keyword research (SEMrush, Ahrefs, Moz, Google Trends) | Keyword briefs, gap analysis | Yes |
| SERP analysis and competitor data | Keyword research, on-page recommendations | Yes |
| Website analytics | Current ranking, traffic tracking | Yes |
| Content CMS access | On-page audits, recommendations | No |
