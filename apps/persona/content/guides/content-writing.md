---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  BRAND_VOICE_DOC_URL: "https://acme.com/brand/voice-guide"
  EDITORIAL_GUIDELINES_URL: "https://style.acme.com"
  CONTENT_CMS_URL: "https://cms.acme.com"
  TARGET_AUDIENCE: "Product managers and engineering leaders"
  SEO_PRIORITIES: "Cloud security, DevOps, CI/CD"
  READABILITY_LEVEL: "Bachelor degree"
---
## Deploying in a content management system

1. Fill the configuration keys above and paste the compiled prompt into the system field of your content-drafting tool.
2. Load {{BRAND_VOICE_DOC_URL}} and {{EDITORIAL_GUIDELINES_URL}} into the agent's knowledge base so writing stays on-brand and follows formatting rules.
3. Provide the article topic, target audience ({{TARGET_AUDIENCE}}), primary keyword or SEO goal, and article outline. The prompt will ask for any missing details.
4. Wire publishing to {{CONTENT_CMS_URL}}, but require human editorial review before anything goes live. The agent drafts; humans publish.
5. Test with: a tutorial request (check code examples run), a long-form guide (verify structure and keyword usage), an SEO rewrite (confirm readability improves), and a claim requiring sources (must provide citations).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Brand voice and style guide | All content | Yes |
| Editorial checklist and standards | Formatting, SEO | Yes |
| Content CMS | Publishing | Yes |
| SEO data (keywords, search volume) | Planning | No |
| Internal knowledge base | Fact-checking, examples | No |
