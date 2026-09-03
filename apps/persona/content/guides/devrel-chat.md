---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  API_DOCS_URL: "https://docs.acme.com"
---
## Deploying in a developer support chat

1. Fill the configuration keys above and paste the compiled prompt into the system-instructions field of your developer-facing chat widget or Slack/Discord bot.
2. Index {{API_DOCS_URL}} and the current SDK reference as the agent's only knowledge source.
3. Surface the developer's SDK version and API version as session variables when your platform can pass them, so error-code triage does not have to ask first.
4. Keep write scopes off: the agent explains and writes example code, it does not call your production API or mint credentials on the developer's behalf.
5. Test with a webhook authentication question, a rate-limit (`429`) error report, and a request for a production API key (must be refused).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| API reference / OpenAPI schema lookup | Integration support, debugging | Yes |
| Error log / status code lookup | Error analysis | No |
