---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  API_DOCS_URL: "https://docs.acme.com"
  SDK_REPO_URL: "https://github.com/acme/acme-sdk"
  CHANGELOG_URL: "https://docs.acme.com/changelog"
  SANDBOX_BASE_URL: "https://sandbox.api.acme.com"
  RATE_LIMIT_DOCS_URL: "https://docs.acme.com/rate-limits"
  STATUS_PAGE_URL: "https://status.acme.com"
  DEVELOPER_SUPPORT_QUEUE: "Platform Engineering"
  MAX_TROUBLESHOOTING_STEPS: "3"
  MAX_DIAGNOSTIC_ROUNDS: "4"
---
## Deploying in a developer support chat

1. Fill the configuration keys above and paste the compiled prompt into the system-instructions field of your developer-facing chat widget, Slack app, or Discord bot. Use the default persona for general chat entry points and the troubleshooting-expert persona for a dedicated `#api-help` or "debug an error" channel where developers arrive already stuck.
2. Index {{API_DOCS_URL}}, the SDK reference at {{SDK_REPO_URL}}, and {{CHANGELOG_URL}} as the agent's only knowledge sources. Re-index on every documentation deploy, not on a fixed schedule, so a just-shipped breaking change is visible the same day.
3. Wire {{STATUS_PAGE_URL}} as a live lookup, not a static link, for the troubleshooting-expert persona: it must check current incidents before diagnosing a suspected platform-side symptom, and a stale cached status page defeats that check.
4. Surface session context automatically when your chat platform supports it: SDK version, API version, and (for logged-in developer portals) plan tier, so the agent does not have to ask for information you already have. Keep write scopes off the agent entirely — it explains, diagnoses, and writes example code, but it never calls your production API, mints a credential, or opens a ticket on the developer's behalf without a human confirming.
5. Set the escalation queue to {{DEVELOPER_SUPPORT_QUEUE}} and confirm the handoff payload (the escalation summary or triage report the persona produces) lands as a structured message in that queue, not a raw chat transcript dump, so an on-call engineer can act on it in under a minute.
6. Calibrate {{MAX_TROUBLESHOOTING_STEPS}} and {{MAX_DIAGNOSTIC_ROUNDS}} to your actual support volume: lower them (2-3) for a high-volume public chat where fast handoff matters more than exhausting self-serve options, raise them (4-5) for a smaller, higher-touch developer program.
7. Test with a live conversation covering: a webhook authentication question, a `429` rate-limit report referencing {{RATE_LIMIT_DOCS_URL}}, a request for a production API key (must be refused with a clear reason), a pasted fake credential (must trigger a rotation instruction, never an echo), and a simulated outage against {{STATUS_PAGE_URL}} (must check status before blaming the developer's code).

## Staging vs production

- Default every troubleshooting reproduction step and every generated snippet to {{SANDBOX_BASE_URL}}. Only let the conversation reference production endpoints when the developer states they are already live and the symptom is production-specific.
- If your chat platform lets you badge or label the bot ("Sandbox mode"), enable it so developers do not mistake sandbox-scoped answers for guaranteed production behavior.

## Auth setup for the chat integration

- Authenticate the chat bot to your internal documentation index and status-page API using a service credential scoped to read-only access; the bot itself never needs write access to anything.
- If the chat widget is embedded in a logged-in developer portal, pass the visitor's plan tier and account age as session context so plan-restriction questions (workflow 2, branch 4 in the troubleshooting-expert persona) resolve without an extra round-trip question.
- Rotate the service credential the bot uses to call your internal tools on the same schedule as other read-only service accounts; it is a lower-risk credential than a production API key but still worth rotating.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| API reference / OpenAPI schema lookup | Integration support, debugging | Yes |
| Error log / status code lookup | Error analysis, triage | No |
| Status page / incident lookup | Troubleshooting-expert outage triage | No |
| SDK repository / changelog lookup | SDK guidance, breaking-change questions | No |
| Rate limit / quota reference lookup | Rate-limit calculations | No |
