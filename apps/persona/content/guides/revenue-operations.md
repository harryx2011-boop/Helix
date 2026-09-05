---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  CRM_NAME: "Salesforce"
  STAGE_DEFINITIONS_URL: "https://ops.example.com/stage-definitions"
  STALE_DEAL_DAYS: "21"
  REQUIRED_FIELDS: "close date, amount, stage, next step, owner"
  LARGE_DEAL_THRESHOLD: "$50,000"
  OPS_QUEUE_NAME: "RevOps Team"
  DUPLICATE_MATCH_FIELDS: "company domain, contact email"
  AUDIT_FREQUENCY_DAYS: "7"
  FORECAST_CATEGORIES: "commit, best case, pipeline, omitted"
  FORECAST_PERIOD: "monthly"
  COMMIT_SLIP_THRESHOLD: "5"
  FORECAST_CALL_TIME: "the Wednesday before period close"
---
## Deploying as a chat assistant

This role covers three personas: the default RevOps Analyst for pipeline and forecast questions, the Pipeline Hygiene persona for scheduled record audits, and the Forecast Desk persona for commit and best-case reviews with a manager. All three share this platform guide.

1. Fill the configuration keys above and paste the compiled prompt into the system field of your team chat assistant (Slack app, internal chat tool, or CRM-embedded chat panel). Compile each persona's prompt separately even though they share this guide.

2. Connect {{CRM_NAME}} as a read-only source of pipeline and deal data; none of the three personas should hold write access. Load {{STAGE_DEFINITIONS_URL}} into the knowledge base so the default persona can quote exit criteria instead of improvising them.

3. Configure {{REQUIRED_FIELDS}} and {{STALE_DEAL_DAYS}} for hygiene checks, and {{DUPLICATE_MATCH_FIELDS}} if deploying the Pipeline Hygiene persona. Configure {{FORECAST_CATEGORIES}} and {{FORECAST_PERIOD}} if deploying the Forecast Desk persona, matching them exactly to how {{CRM_NAME}} labels forecast categories.

4. Wire {{OPS_QUEUE_NAME}} as the destination for every escalation and every change request across all three personas; none of them can write to a deal record, so this queue is where every fix and every category change actually lands. Set {{LARGE_DEAL_THRESHOLD}} so high-value deals get flagged distinctly in hygiene and forecast output.

5. Test with three cases: a pipeline value question scoped to one team (should return a figure with an as-of date and filter), a deal missing two required fields (should appear on the correct owner's fix list, not get silently skipped), and a commit deal slipping stage close to {{FORECAST_CALL_TIME}} (should trigger an immediate flag rather than waiting for the next scheduled review).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| {{CRM_NAME}} query (read-only) | Pipeline questions, hygiene audits, forecast review | Yes |
| Stage definitions reference ({{STAGE_DEFINITIONS_URL}}) | Stage and process questions | Yes |
| Owner/queue routing to {{OPS_QUEUE_NAME}} | All change requests and escalations | Yes |
| Duplicate-record match query | Pipeline Hygiene persona only | No |
