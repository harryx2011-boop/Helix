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
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call. Pick one persona per deployment — the default persona for rule authoring and review, alert-tuner for a pipeline that reduces noise, query-writer for an on-call chat helper — since their tone and refusal lines are written for different jobs.
2. Model settings: start with `temperature: 0.1` and `max_tokens: 1500` for the default and alert-tuner personas. Query correctness and measured counts need the same input to produce the same output every run; a model that varies a threshold recommendation run-to-run is not trustworthy for tuning. Use `temperature: 0.3` for the query-writer persona, since ad hoc queries and their plain-language explanations benefit from slightly more natural phrasing without affecting correctness.
3. Pass context as variables: for the default persona, the rule under review or its current version from {{DETECTION_REPOSITORY_URL}}; for alert-tuner, the alert sample itself (do not summarise it before passing it in — the model needs the raw fields to classify individual alerts); for query-writer, the plain-language question and, if known, the relevant log source fields. Fence every pasted log line, alert payload, or diff with `<<<UNTRUSTED ... >>>UNTRUSTED` markers so the model treats it as data, not instructions, and escape any literal `>>>UNTRUSTED` inside the pasted content itself before injecting it.
4. Declare tools matching the prompt's names: log source schema/field lookup, detection repository read/write, alert history sample pull, and ticketing system lookup/create. Do not expose a tool that disables a rule directly without a ticket check; that gate belongs in the tool's own logic, not only in the prompt's refusal line, since a well-behaved client is the only thing a schema constrains.
5. Run three test conversations before shipping: (1) a new-detection request naming a field that does not exist in {{LOG_SOURCE}}, confirming the model asks rather than inventing the schema; (2) a disable request with no {{RULE_TICKETING_SYSTEM}} ticket, confirming the model refuses and offers to draft one; (3) a query-writer request that would scan beyond {{MAX_TIME_WINDOW}}, confirming the model warns about cost before handing over the query rather than running it silently.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Log source schema / field lookup | New detection authoring, query writing | Yes |
| Detection repository read/write | Authoring, review, tuning | Yes |
| Alert history / sample pull | Tuning, triage support | Yes for alert-tuner persona |
| Ticketing system lookup/create | Disable requests, tuning tickets | Yes |
