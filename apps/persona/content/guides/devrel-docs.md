---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  API_DOCS_URL: "https://docs.acme.com"
  SDK_REPO_URL: "https://github.com/acme/acme-sdk"
  CHANGELOG_URL: "https://docs.acme.com/changelog"
  SANDBOX_BASE_URL: "https://sandbox.api.acme.com"
  RATE_LIMIT_DOCS_URL: "https://docs.acme.com/rate-limits"
  WEBHOOK_SIGNING_DOC_URL: "https://docs.acme.com/webhooks/signing"
  SUPPORTED_LANGUAGES: "TypeScript, Python, Go"
  DEVELOPER_SUPPORT_QUEUE: "Platform Engineering"
  MAX_TROUBLESHOOTING_STEPS: "3"
---
## Deploying inside developer documentation

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant embedded in your docs site. Use the default persona on general documentation pages and the sample-code-generator persona on API-reference and quickstart pages where developers expect runnable code rather than conversational support.
2. Index {{API_DOCS_URL}}, the SDK reference and source at {{SDK_REPO_URL}}, and {{CHANGELOG_URL}} as the agent's only knowledge sources; pin the index to the same deploy pipeline as the docs site so a staged doc update and a staged prompt update ship together, not on separate cadences. Answers outside that indexed scope should decline and point to {{DEVELOPER_SUPPORT_QUEUE}} rather than guess.
3. Pass the visitor's detected SDK language and version to the agent as session context whenever your docs platform exposes it (a language switcher, a detected `User-Agent`, or a signed-in account's stored preference), restricted to the languages in {{SUPPORTED_LANGUAGES}}, so code samples match what the visitor is actually using without asking first.
4. Point every generated sample's setup instructions at {{SANDBOX_BASE_URL}} instead of your production base URL, and if the product has webhooks, wire {{WEBHOOK_SIGNING_DOC_URL}} so signature-verification samples cite the correct scheme rather than a generic HMAC example. Keep write scopes off: the agent explains and writes example code, it never calls your production API or triggers a real webhook delivery on the visitor's behalf.
5. Rate-limit sample generation per session (a reasonable default is 10-20 generations per visitor per hour) separately from the API's own limits in {{RATE_LIMIT_DOCS_URL}}, since a docs-embedded assistant is public and unauthenticated traffic can otherwise script it into a free code-generation endpoint.
6. Version the embedded prompt with the docs site itself: when {{CHANGELOG_URL}} records a breaking change, update the prompt's placeholder values (especially {{API_DOCS_URL}} anchors and {{SUPPORTED_LANGUAGES}}) in the same pull request as the doc content change, and note in your release process that a docs deploy without a corresponding prompt review is incomplete.
7. Test with four scenarios before publishing: an authentication question (must cite the exact header and token format), a multi-language sample request across two of {{SUPPORTED_LANGUAGES}} (must produce separate labeled, runnable samples), an SDK installation question naming a specific version (must reference {{SDK_REPO_URL}} and {{CHANGELOG_URL}} rather than assume compatibility), and a request for an undocumented endpoint (must decline rather than fabricate a schema).

## Staging vs production

- Every sample's setup instructions and default base URL must point at {{SANDBOX_BASE_URL}}, never your production API, so a developer copying a snippet straight from the docs site cannot accidentally run it against live data on first try.
- If your docs site has separate staging and production doc builds, ship the compiled prompt through the same build pipeline so a staging-only endpoint never appears in a production-facing sample, and a soon-to-launch endpoint does not leak early.

## Auth setup for the embedded assistant

- Give the docs-embedded assistant a read-only service credential for your documentation index, SDK repository, and changelog; it needs no write access and no access to your production API at all.
- Since this surface is public and typically unauthenticated, apply the per-session rate limit from step 5 at the edge (your docs site's backend or CDN function), not only inside the prompt, so a scripted abuser cannot bypass it by stripping the system prompt's own guidance.
- If the docs site later adds signed-in developer accounts, pass the account's plan tier as session context so sample generation can reflect plan-gated features without asking.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| API reference / OpenAPI schema lookup | Integration support, debugging, sample generation | Yes |
| SDK repository / changelog lookup | Documentation guidance, sample generation | Yes |
| Rate limit / quota reference lookup | Sample generation for bulk/loop operations | No |
| Webhook signing-scheme lookup | Webhook sample generation | No |
