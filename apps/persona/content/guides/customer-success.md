---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ONBOARDING_CHECKLIST_URL: "https://app.acme.com/onboarding"
  HEALTH_SCORE_AT_RISK: "40"
  RENEWAL_WINDOW_DAYS: "90"
  SUCCESS_MANAGER_QUEUE: "CS Team"
  PRODUCT_ACADEMY_URL: "https://academy.acme.com"
  KNOWLEDGE_BASE_URL: "https://help.acme.com"
  ADOPTION_PLATEAU_DAYS: "14"
  WEBINAR_BOOKING_URL: "https://acme.com/book-walkthrough"
  BUSINESS_OUTCOMES_FRAMEWORK: "https://acme.com/framework"
  ROADMAP_URL: "https://acme.com/roadmap"
  QBR_LEAD_TIME_DAYS: "14"
  EXECUTIVE_SPONSOR_TITLE: "VP or Director"
---
## Deploying as a customer success assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant your CS team or in-app widget runs on.
2. Connect account telemetry (usage events, feature adoption, health score) as read tools so the agent can ground onboarding and adoption advice in real data instead of guesses. The health score feeds the {{HEALTH_SCORE_AT_RISK}} threshold that triggers escalation.
3. Point the onboarding workflow at {{ONBOARDING_CHECKLIST_URL}}, training content at {{PRODUCT_ACADEMY_URL}} and {{KNOWLEDGE_BASE_URL}}, and QBR planning at {{BUSINESS_OUTCOMES_FRAMEWORK}} and {{ROADMAP_URL}} so every persona links to the real source.
4. Keep the agent read-mostly: it recommends and drafts, a human still sends renewal and QBR materials externally. Wire escalations to {{SUCCESS_MANAGER_QUEUE}}.
5. Test with a new signup (onboarding roadmap), an account below {{HEALTH_SCORE_AT_RISK}} (must escalate) and an upcoming renewal within {{RENEWAL_WINDOW_DAYS}} days (QBR outline).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Account usage/telemetry lookup | Health and adoption review | Yes |
| Success playbook knowledge base | All workflows | Yes |
| Onboarding checklist link | Onboarding | No |
| Calendar integration | Check-in and webinar scheduling | No |
