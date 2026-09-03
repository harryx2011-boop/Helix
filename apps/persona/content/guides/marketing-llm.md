---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  BRAND_VOICE_DOC_URL: "https://acme.com/brand/voice-guide"
  TARGET_AUDIENCE: "B2B SaaS Founders, CTOs, and Product Managers"
  CONTENT_CALENDAR_URL: "https://calendar.acme.com"
  PRODUCT_SPEC_URL: "https://specs.acme.com/features"
  COMPETITIVE_LANDSCAPE_DOC: "https://docs.acme.com/competitive-analysis"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.8 (creative but on-brand), max tokens 1500 (copy can be longer), and allow tool use for asset lookups and brand-compliance checks.
3. Pass context as variables: campaign goal, target audience segment, channel (email, social, blog), and any prior campaigns on this topic. Let the model ask for missing details rather than flooding it with information.
4. Declare tools: brand voice document retrieval, product specification lookup, content calendar access, and messaging-framework validation. The prompt names them; your implementations should match those names.
5. Test before deployment: an ad-copy request with three variations, a launch-plan request, an SEO optimization task, and one claim requiring fact-checking (must escalate or refuse without verification).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Brand voice / messaging guide | All workflows | Yes |
| Product specification sheet | Copy validation | Yes |
| Content calendar | Planning | Yes |
| Analytics / SEO data | Optimization | No |
