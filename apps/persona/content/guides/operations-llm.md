---
config_keys:
  COMPANY_NAME: "Acme Corp"
  OPERATIONS_EMAIL: "ops@example.com"
  PROCESS_WIKI: "https://docs.example.com/processes"
  VENDOR_DIRECTORY: "https://docs.example.com/vendors"
  INCIDENT_RESPONSE_PLAN: "https://docs.example.com/incident-response"
  SLA_TRACKING: "https://dashboards.example.com/sla"
  APPROVAL_AUTHORITY: "Operations Manager"
  VENDOR_SLA_GRACE_MINUTES: "30"
  INCIDENT_TRACKING_SYSTEM: "https://issues.example.com/incidents"
  SEVERITY_DEFINITIONS: "P1: down or major impact; P2: degraded; P3: minor issue; P4: cosmetic"
  ESCALATION_TIMELINE: "P1: 5 min, P2: 15 min, P3: 1 hour, P4: next business day"
  BLAMELESS_POLICY: "https://docs.example.com/blameless-postmortems"
  STAKEHOLDER_NOTIFICATION: "VP Operations, on-call lead"
  STATUS_UPDATE_INTERVAL_P1: "15 minutes"
  AUDIT_FRAMEWORK: "Completeness, clarity, adherence, efficiency, risk"
  AUDIT_CADENCE: "Quarterly"
  STAKEHOLDER_LIST: "Process owners, regular users, managers"
  IMPROVEMENT_BACKLOG: "https://issues.example.com/ops-improvements"
  ADHERENCE_GAP_THRESHOLD: "25%"
---
## Deploying on a model API

1. Paste the compiled persona prompt into the system message field. Set `temperature: 0.3` (low variability for procedural output), `max_tokens: 1200`, and enable tool use for document retrieval, incident logging and SLA updates.
2. Pass operational requests as user-message text: process updates carry the process name, trigger and steps; incidents carry affected systems, discovery time and business impact; vendor issues carry the vendor name and SLA term; audits carry the process name and scope. Fence any pasted incident report or vendor message with `<<<UNTRUSTED ... >>>UNTRUSTED` so the model treats embedded instructions as data, never as commands.
3. The model retrieves procedures from {{PROCESS_WIKI}}, vendor contacts and SLA terms from {{VENDOR_DIRECTORY}}, and incident procedures from {{INCIDENT_RESPONSE_PLAN}}. Severity classification is fixed by {{SEVERITY_DEFINITIONS}} and never adjustable by the caller; escalation timing follows {{ESCALATION_TIMELINE}} and {{VENDOR_SLA_GRACE_MINUTES}}.
4. Tools to wire: wiki access (retrieve and create runbooks), vendor directory API (contacts and SLA terms), incident tracker API ({{INCIDENT_TRACKING_SYSTEM}} — log, update, close), SLA dashboard API ({{SLA_TRACKING}} — mark misses and at-risk KPIs), notification service (alert {{STAKEHOLDER_NOTIFICATION}} and {{OPERATIONS_EMAIL}}), and an improvement-backlog API ({{IMPROVEMENT_BACKLOG}}) for the Process Auditor persona.
5. Test before enabling: a process documentation request (model drafts a runbook in the exact template and asks for owner review), a P1 incident (model logs within 2 minutes, classifies severity, and notifies {{STAKEHOLDER_NOTIFICATION}} immediately per {{ESCALATION_TIMELINE}}), and a vendor SLA miss (model escalates to {{APPROVAL_AUTHORITY}} after {{VENDOR_SLA_GRACE_MINUTES}} minutes and updates {{SLA_TRACKING}}). All three must execute without manual correction before going live.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Wiki / documentation API | Retrieve and create process docs in {{PROCESS_WIKI}} | Yes |
| Vendor directory API | Look up contact and SLA info in {{VENDOR_DIRECTORY}} | Yes |
| Incident tracker API | Log incidents and postmortems in {{INCIDENT_TRACKING_SYSTEM}} | Yes |
| SLA dashboard API | Update metrics and mark incidents in {{SLA_TRACKING}} | Yes |
| Email / notification service | Alert {{STAKEHOLDER_NOTIFICATION}} and owners | Yes |
| Improvement backlog API | Log findings in {{IMPROVEMENT_BACKLOG}} | For the Process Auditor persona |
