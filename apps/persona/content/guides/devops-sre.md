---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  INCIDENT_CHANNEL: "#incidents"
  RUNBOOK_REPOSITORY_URL: "https://runbooks.example.com"
  BLAMELESS_POSTMORTEM_PROCESS: "https://example.com/postmortem-process"
  INCIDENT_SEVERITY_CRITERIA: "SEV1: Full customer impact; SEV2: Partial impact; SEV3: Minor/no impact"
  ONCALL_ESCALATION_GROUP: "@sre-on-call"
  MAX_REMEDIATION_ATTEMPTS: "2"
  STATUS_PAGE_URL: "https://status.example.com"
  INFRASTRUCTURE_STANDARDS_URL: "https://example.com/infra-standards"
  CHANGE_ADVISORY_BOARD_EMAIL: "change-advisory@example.com"
  DEPLOYMENT_CHECKLIST: "https://example.com/deploy-checklist"
  INFRASTRUCTURE_AS_CODE_FRAMEWORK: "Terraform"
  PRODUCTION_ENVIRONMENT_NAME: "prod"
  MAX_UNREVIEWED_RISK_SCORE: "7 out of 10"
  OBSERVABILITY_PLATFORM: "Datadog"
  SLO_TARGET_UPTIME: "99.95%"
  MEAN_TIME_TO_RECOVERY_SLI: "15 minutes"
  METRICS_DASHBOARD_URL: "https://metrics.example.com"
  ERROR_BUDGET_WINDOW: "30 days"
  ERROR_BUDGET_BURN_ALERT_THRESHOLD: "2x sustainable rate"
---
## Deploying in an incident chat platform or code review tool

1. Fill the configuration keys above and paste the compiled prompt into the system field of your incident bot (Slack, PagerDuty, Opsgenie or a custom chat platform) for the default persona, or into your CI/PR-bot system prompt for the platform-deployment persona, or your docs/wiki assistant for the reliability-audit persona. Each persona is a separate deployment; do not run all three off one shared bot identity, since their tone and workflows diverge.
2. Expose session context automatically rather than asking the user to type it: for incident chat, the channel or thread, declared severity, current status marker, and on-call user; for code review, the PR diff, target branch and environment; for the reliability audit, the service name and its current SLO if one exists. The prompt is written to avoid re-asking for anything already present in context.
3. Wire tools per persona: the incident responder needs runbook lookup and paging wired to real endpoints, not stubs, before go-live, since Workflow 3 (escalation) depends on {{ONCALL_ESCALATION_GROUP}} actually receiving a page. The platform engineer needs read access to {{INFRASTRUCTURE_STANDARDS_URL}} and the diff itself; it does not need write access to the IaC state. The reliability engineer needs read access to {{OBSERVABILITY_PLATFORM}} and {{METRICS_DASHBOARD_URL}}; without it, Workflow 2's gap audit degrades to guesswork, which the prompt is instructed to refuse.
4. Route {{ONCALL_ESCALATION_GROUP}} alerts through your standard paging tool (PagerDuty, Opsgenie) so escalations reach a real person within your paging SLA, not just a chat mention that can go unread. For the platform-deployment persona, route anything crossing {{MAX_UNREVIEWED_RISK_SCORE}} to {{CHANGE_ADVISORY_BOARD_EMAIL}} as an actual notification, since the model only drafts the summary and a human must send it.
5. Test each persona against a scenario specific to its workflows before go-live: for the incident responder, simulate a SEV1, confirm the model classifies severity correctly, fetches a matching runbook, and escalates to {{ONCALL_ESCALATION_GROUP}} after {{MAX_REMEDIATION_ATTEMPTS}} failed steps; for the platform engineer, submit a Terraform diff with an over-broad IAM policy and confirm it is blocked with a cited line and fix, not just a warning; for the reliability engineer, request an SLO for a service with no historical incident data and confirm it asks for the data rather than inventing a target.

## Runbook gaps, change-advisory routing and paging nuance

- If a symptom has no matching runbook, the incident responder should say so in its status update rather than silently offering generic advice; treat every such gap as a postmortem action item, not a one-off exception.
- Severity-tiered paging matters: map each tier in {{INCIDENT_SEVERITY_CRITERIA}} to a distinct escalation policy in your paging tool so SEV3 does not wake the same rotation as SEV1. A prompt that classifies severity correctly is wasted if the paging tool ignores the distinction.
- For the platform-deployment persona, a change advisory summary is a draft for a human sender, never an auto-approval; wire {{CHANGE_ADVISORY_BOARD_EMAIL}} as a notification target the human reviews before it goes out.
- For the reliability-audit persona, error-budget burn tracking against {{ERROR_BUDGET_WINDOW}} needs a scheduled job or dashboard query, not a one-time calculation; wire it to re-check {{ERROR_BUDGET_BURN_ALERT_THRESHOLD}} on a recurring basis so escalation trigger 2 actually fires when burn accelerates.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Runbook lookup and repository access | Incident response, deployment safety checks | Yes |
| Alert and escalation (page on-call) | Escalation workflow | Yes |
| Incident declaration and status tracking | Triage and communication | Yes |
| Postmortem creation and template | Postmortem workflow | No, but strongly recommended |
| Infra standards / policy-as-code lookup | Infra code review (platform-deployment persona) | Yes for that persona |
| Change advisory notification | Change advisory drafting (platform-deployment persona) | No |
| Metrics and dashboard access | Status assessment, SLO and gap audits (reliability-audit persona) | Yes for that persona |
