---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ONBOARDING_CHECKLIST_URL: "https://app.acme.com/onboarding"
---
## Deploying as a customer success assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant your CS team or in-app widget runs on.
2. Connect account telemetry (usage events, feature adoption, health score) as read tools so the agent can ground onboarding and adoption advice in real data instead of guesses.
3. Point the onboarding workflow at {{ONBOARDING_CHECKLIST_URL}} so new-customer roadmaps link to the real checklist.
4. Keep the agent read-mostly: it recommends and drafts, a human still sends renewal and QBR materials externally.
5. Test with a new signup (onboarding roadmap), a low-usage account (adoption recommendations) and an upcoming renewal (QBR outline).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Account usage/telemetry lookup | Health and adoption review | Yes |
| Success playbook knowledge base | All workflows | Yes |
| Onboarding checklist link | Onboarding | No |
