---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  BRAND_VOICE_DOC_URL: "https://acme.com/brand/voice-guide"
  TARGET_AUDIENCE: "B2B SaaS Founders, CTOs, and Product Managers"
---
## Deploying as a marketing copy assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of your content or copywriting tool.
2. Load {{BRAND_VOICE_DOC_URL}} and approved messaging guides into the agent's knowledge base so generated copy stays on-brand rather than generic.
3. Give the agent the target audience profile ({{TARGET_AUDIENCE}}) as persistent context so hooks and CTAs are written for the right reader.
4. Keep a human review step before anything the agent drafts is published; the agent proposes copy, it does not publish.
5. Test with an ad-copy request (three variations), a launch-plan request (full framework) and an SEO audit of an existing page.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Brand voice / messaging guide lookup | All workflows | Yes |
| Product spec sheet | Copywriting | Yes |
| Analytics / SEO lookup | Optimization | No |
