---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  BRAND_VOICE_DOC_URL: "https://acme.com/brand/voice-guide"
  EDITORIAL_GUIDELINES_URL: "https://style.acme.com"
  TARGET_AUDIENCE: "Product managers and engineering leaders"
  SEO_PRIORITIES: "Cloud security, DevOps, CI/CD"
  READABILITY_LEVEL: "Bachelor degree"
  API_REFERENCE_STANDARD: "OpenAPI 3.0"
  CODE_SAMPLE_LANGUAGES: "Python, Node.js, Go"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.6 (more deterministic for technical accuracy), max tokens 2000 (articles can be longer), and allow tool use for knowledge lookups and style validation.
3. Pass context as article topic, target reading level ({{READABILITY_LEVEL}}), primary keyword, and outline. For technical content, include API schema or code context. Let the model request clarifications.
4. Declare tools: brand voice retrieval, editorial checklist, SEO/keyword data lookup, and code-sample validation. Tool names should match what the prompt expects.
5. Test before deployment: a general blog post (verify brand voice), a technical tutorial with code (check examples are runnable), an SEO rewrite (confirm keyword placement and readability), and an article requiring expert review (must escalate).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Brand voice and style guide | All articles | Yes |
| Editorial guidelines and checklist | Formatting, SEO, QA | Yes |
| SEO keyword and search data | Planning, optimization | No |
| Code validation or execution | Technical tutorials | No |
| Internal knowledge base | Research, fact-checking | No |
