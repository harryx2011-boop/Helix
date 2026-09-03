---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  API_DOCS_URL: "https://docs.example.com"
  SDK_REPO_URL: "https://github.com/acme/acme-sdk"
  CHANGELOG_URL: "https://docs.example.com/changelog"
  SANDBOX_BASE_URL: "https://sandbox.api.example.com"
  RATE_LIMIT_DOCS_URL: "https://docs.example.com/rate-limits"
  WEBHOOK_SIGNING_DOC_URL: "https://docs.example.com/webhooks/signing"
  STATUS_PAGE_URL: "https://status.example.com"
  DEVELOPER_SUPPORT_QUEUE: "Platform Engineering"
  SUPPORTED_LANGUAGES: "TypeScript, Python, Go"
  MAX_TROUBLESHOOTING_STEPS: "3"
  MAX_DIAGNOSTIC_ROUNDS: "4"
---
## Deploying on a plain LLM API

1. Put the compiled prompt in the system message slot unmodified. Substitute every `{{PLACEHOLDER}}` above at compile time; do not leave a raw `{{TOKEN}}` in a live system prompt, since an unfilled token reads to the model as literal text to echo back.
2. Set temperature to 0.2-0.3 and max output tokens to 2048-4096 (the sample-code-generator persona needs the higher end, since a multi-language response with headers and checklists runs long). Low temperature keeps code generation and status-code triage deterministic; higher temperature produces inconsistent error categorization across identical inputs.
3. Enable tool/function calling if your platform supports it, and pass developer context as structured fields rather than free text: `language`, `sdk_version`, `api_version`, `status_code`. Fence all pasted content (stack traces, payloads, config files) as `<<<UNTRUSTED ... >>>UNTRUSTED` before it reaches the model, and close the fence even if the pasted content itself contains the closing marker, so injected text cannot escape into trusted position.
4. Declare these tools if function calling is available, matching the names the prompts call them by: `lookup_api_schema` (endpoint, method), `lookup_error_code` (HTTP status or error string), `lookup_sdk_docs` (SDK name, version), and `lookup_changelog` (version range) for the default and sample-code-generator personas; add `lookup_status` (no arguments, returns current incidents) for the troubleshooting-expert persona so it can check {{STATUS_PAGE_URL}} programmatically instead of guessing. Keep tool responses under roughly 2000 tokens each; truncate schema dumps and tell the model explicitly how many fields were cut.
5. Rate-limit the LLM call itself separately from the API's own rate limits described in {{RATE_LIMIT_DOCS_URL}} — a burst of developer questions should not exhaust your LLM provider quota before a real API incident does.
6. Version the system prompt alongside {{CHANGELOG_URL}}: whenever the underlying API ships a breaking change, update the prompt's placeholder values and any inline behavior notes in the same release cycle, not on a separate schedule.
7. Test with five conversations before deploying: authenticate to a webhook endpoint (must return the exact header and signature scheme, citing {{WEBHOOK_SIGNING_DOC_URL}} if set), debug a `401 Unauthorized` (must reference auth guardrails, not just link out), request a production API key (must refuse and explain why), paste a fake API key inline (must instruct rotation and never echo the key), and ask a multi-language sample question (must produce separate labeled sections, not one merged answer).

## Staging vs production

- Point every sample and every troubleshooting reproduction step at {{SANDBOX_BASE_URL}} by default. Only reference a production base URL when the developer explicitly states they are already integrated against production and the question concerns production-only behavior (a live incident, a production-only feature flag).
- Never let the model call a real tool against production credentials on the developer's behalf; tool calls this prompt declares are read-only lookups (schema, docs, status), not mutating API calls.
- If your LLM platform supports per-key rate limits, put this integration on its own key so a burst of developer traffic cannot starve other LLM-backed features sharing the account.

## Auth and secrets handling

- Store any credential the LLM tooling layer itself needs (a token to call `lookup_api_schema` against a private OpenAPI index, for example) in your platform's secrets manager, never in the compiled prompt text.
- The model must never see your internal service credentials; tool implementations should authenticate to internal systems themselves and return only the documentation content the model needs.
- If a developer pastes a real credential into the conversation, your logging pipeline should redact it before storage, independent of the model's own refusal to repeat it back.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| API schema lookup (endpoint, method) | Integration support, error triage, sample generation | Yes |
| Error code / status reference lookup | Error analysis, troubleshooting | Yes |
| SDK documentation / repository lookup | SDK guidance, sample generation | Yes |
| Changelog / version-diff lookup | Breaking-change questions | No |
| Status page / incident lookup | Troubleshooting-expert outage triage | No |
| Rate limit / quota reference lookup | Rate-limit calculations, bulk-sample generation | No |
| Webhook signing-scheme lookup | Webhook sample generation and verification questions | No |
