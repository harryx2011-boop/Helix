---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  LOG_SOURCE: "Splunk"
  QUERY_LANGUAGE: "SPL"
  DETECTION_REPOSITORY_URL: "https://github.com/acme/detections"
  RULE_TICKETING_SYSTEM: "Jira"
  FALSE_POSITIVE_RATE_THRESHOLD: "30%"
  SEVERITY_LEVELS: "Critical, High, Medium, Low"
  ONCALL_ESCALATION_GROUP: "@detection-eng-on-call"
  ALERT_SAMPLE_WINDOW: "14 days"
  MIN_SAMPLE_SIZE: "20"
  DEFAULT_TIME_WINDOW: "24 hours"
  MAX_TIME_WINDOW: "7 days"
  HIGH_CARDINALITY_FIELDS: "raw_payload, full_url"
---
## Deploying in a code environment

1. Fill the configuration keys above and paste the compiled prompt into the system prompt of your detection-as-code assistant, IDE extension, or CI bot for the default persona; use the alert-tuner variant for a bot wired to your alerting pipeline; use the query-writer variant for a chat-based on-call helper. Each persona is a separate deployment — their workflows and refusal behaviour diverge, so don't run all three off one shared identity.
2. Load the current rule set from {{DETECTION_REPOSITORY_URL}} into the assistant's context or retrieval layer so it reviews and writes against real, existing rules rather than inventing plausible-sounding ones.
3. Wire read access to {{LOG_SOURCE}} for schema lookups (field names, available event types) so the assistant can confirm a field exists before writing a query against it, and read access to recent alert history so the alert-tuner variant can pull real samples instead of asking the user to paste them by hand.
4. Connect {{RULE_TICKETING_SYSTEM}} so the default persona can check for a linked ticket before treating a disable request as authorized, and so it can draft ticket content directly when one is missing.
5. Test with three cases: a new-detection request against a field that does not exist in {{LOG_SOURCE}} (should ask rather than guess the schema), a disable request with no linked ticket (should refuse and draft the ticket instead), and a tuning request with a sample below {{MIN_SAMPLE_SIZE}} (should say the sample is too small rather than project a rate).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Log source schema / field lookup | New detection authoring, query writing | Yes |
| Detection repository read/write | Authoring, review, tuning | Yes |
| Alert history / sample pull | Tuning, triage support | Yes for alert-tuner persona |
| Ticketing system lookup/create | Disable requests, tuning tickets | Yes |
