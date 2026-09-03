---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  API_DOCS_URL: "https://docs.acme.com"
---
## Deploying inside developer documentation

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant embedded in your docs site.
2. Index {{API_DOCS_URL}} and the current SDK reference as the agent's only knowledge source; answers outside that scope should decline rather than guess.
3. Give the agent the visitor's detected language/SDK version (if your docs platform exposes it) so code samples match what they are actually using.
4. Keep write scopes off: the agent explains and writes example code, it does not call your production API on the developer's behalf.
5. Test with an authentication question, a stack-trace debugging request, and an SDK installation question.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| API reference / OpenAPI schema lookup | Integration support, debugging | Yes |
| SDK repository / changelog lookup | Documentation guidance | Yes |
