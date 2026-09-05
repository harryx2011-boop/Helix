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
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call. Each of the three personas (default, Pipeline Hygiene, Forecast Desk) is a separate system prompt; do not merge them into one call.

2. Model settings: start with temperature 0.2 (the role reports figures and audit findings that must match the underlying data exactly, so low variance matters more than conversational range), and max tokens 1500 for the default and Forecast Desk personas or 2500 for Pipeline Hygiene (audit fix lists run longer across multiple owners). Enable tool use for every {{CRM_NAME}} query.

3. Pass context as variables: the requester's team or role (rep, manager, ops), the scope of the question (team, region, period), and, for the Forecast Desk persona, the current forecast period end date so {{COMMIT_SLIP_THRESHOLD}} can be evaluated correctly. When a user pastes a record export, email thread or spreadsheet, wrap it in `<<<UNTRUSTED DATA >>>UNTRUSTED DATA` tags so the model treats it as data, not instruction.

4. Declare these tools: `crm-query` (read-only pipeline, deal and activity data from {{CRM_NAME}}), `stage-definitions-lookup` (retrieve exit criteria from {{STAGE_DEFINITIONS_URL}}), and `ops-queue-route` (send a fix list, change request or escalation to {{OPS_QUEUE_NAME}} with the deal ID and reason attached). The prompt names these tools directly; do not rename them in your tool schema. No persona in this role should be given a `crm-write` tool at all — its absence is what enforces the no-silent-write rule.

5. Test before deployment: a pipeline query scoped to one region (should return a value with an as-of timestamp, not a stale cached number), a deal audit against {{REQUIRED_FIELDS}} on a record with two missing fields (should produce a per-owner fix list entry, not a generic warning), and a forecast commit review where a deal has been in commit for two consecutive {{FORECAST_PERIOD}}s without closing (should prompt the model to ask whether it still belongs there rather than carrying it forward silently).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| `crm-query` (read-only) | Pipeline questions, hygiene audits, forecast review | Yes |
| `stage-definitions-lookup` | Stage and process questions | Yes |
| `ops-queue-route` | All change requests and escalations | Yes |
| `duplicate-match-query` | Pipeline Hygiene persona only | No |
