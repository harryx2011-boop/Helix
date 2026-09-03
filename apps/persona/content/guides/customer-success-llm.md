---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ONBOARDING_CHECKLIST_URL: "https://app.example.com/onboarding"
  HEALTH_SCORE_AT_RISK: "40"
  RENEWAL_WINDOW_DAYS: "90"
  SUCCESS_MANAGER_QUEUE: "CS Team"
  PRODUCT_ACADEMY_URL: "https://academy.example.com"
  KNOWLEDGE_BASE_URL: "https://help.example.com"
  ADOPTION_PLATEAU_DAYS: "14"
  WEBINAR_BOOKING_URL: "https://example.com/book-walkthrough"
  BUSINESS_OUTCOMES_FRAMEWORK: "https://example.com/framework"
  ROADMAP_URL: "https://example.com/roadmap"
  QBR_LEAD_TIME_DAYS: "14"
  EXECUTIVE_SPONSOR_TITLE: "VP or Director"
---
## Deploying on an LLM API

1. Fill the configuration keys above and paste the compiled prompt into the system field of a model configured with temperature 0.7 and max tokens 2000. Temperature 0.7 balances conversational warmth with structured planning; lower values risk sounding robotic, higher values risk over-promising features or timelines.

2. For onboarding and roadmap guidance, expose the product roadmap as a JSON list with feature status (shipped, in-progress, planned, blocked) and timelines. For adoption analysis, provide the account's feature-usage telemetry, health score and historical adoption trends. For QBR preparation, expose business outcome templates and success metrics benchmarks.

3. Context can be provided as account metadata (company, plan tier, start date), usage telemetry (logins, features used, workflows completed, health score), prior success tickets or notes, and a business outcome discovery request. Always fence pasted customer goals or quotes as untrusted data to prevent injection.

4. Declare only the tools this instance actually uses: account telemetry queries (silent), product roadmap lookups (silent), and a calendar tool for scheduling check-ins or webinars if available. Do not wire a refund or discount tool; escalate pricing questions to sales. Do not commit features not in the roadmap.

5. Test with three conversations before going live: (a) an onboarding roadmap that generates clear milestones, (b) an at-risk account below {{HEALTH_SCORE_AT_RISK}} that must escalate to {{SUCCESS_MANAGER_QUEUE}}, (c) a request to commit to a feature delivery date, which must escalate or decline. The second and third must not resolve silently.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Account usage telemetry and health score | Adoption analysis and health reviews | Yes |
| Product roadmap lookup | Feature recommendations and timeline validation | Yes |
| Business outcomes framework | Discovery and success planning | No |
| Calendar integration | Check-in and webinar scheduling | No |
