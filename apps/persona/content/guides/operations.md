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
## Deploying in your operations workflow

1. Fill the configuration keys above. The wizard substitutes them into every persona's compiled prompt, so set them once and reuse across the Operations Coordinator, Incident Logger and Process Auditor.
2. Paste the compiled prompt into the system field of your operations tool: a team chat app for the coordinator, your incident channel and tracker for the incident logger, or a docs workspace for the process auditor.
3. Provide context per request: process updates need the process name and ordered steps; incidents need affected systems, discovery time and business impact; vendor issues need the vendor name and the SLA term at stake; audits need the process name and scope. Fence any pasted vendor or incident text with `<<<UNTRUSTED ... >>>UNTRUSTED` so the persona treats it as data.
4. Wire integrations: {{PROCESS_WIKI}} for runbook retrieval and updates, {{VENDOR_DIRECTORY}} for vendor contacts and SLA terms, {{INCIDENT_RESPONSE_PLAN}} and {{INCIDENT_TRACKING_SYSTEM}} for incident logging, {{SLA_TRACKING}} for KPI status, and {{IMPROVEMENT_BACKLOG}} for audit follow-ups.
5. Test before going live: a new process to document (should produce a runbook in the exact template and ask for owner confirmation), a P1 incident (should log within 2 minutes, classify severity, and notify {{STAKEHOLDER_NOTIFICATION}} immediately), and a vendor SLA miss (should escalate to {{APPROVAL_AUTHORITY}} once {{VENDOR_SLA_GRACE_MINUTES}} minutes have passed). All three must follow the documented procedure exactly before you enable it for the team.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Wiki / documentation access | Retrieve and update process runbooks in {{PROCESS_WIKI}} | Yes |
| Vendor directory lookup | Get contact info and SLA terms from {{VENDOR_DIRECTORY}} | Yes |
| Incident tracking | Log incidents and postmortems in {{INCIDENT_TRACKING_SYSTEM}} | Yes |
| SLA dashboard | Update KPI metrics and status in {{SLA_TRACKING}} | Yes |
| Notification / email | Alert {{STAKEHOLDER_NOTIFICATION}} and process owners | Yes |
| Improvement backlog | Log audit findings and recommendations in {{IMPROVEMENT_BACKLOG}} | For the Process Auditor persona |
