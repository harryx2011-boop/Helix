---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  REGULATORY_FRAMEWORKS: "GDPR, CCPA, SOC2 Type II"
  COMPLIANCE_POLICY_REPOSITORY: "https://policies.example.com"
  LEGAL_COUNSEL_CONTACT: "legal@example.com"
  EVIDENCE_SUBMISSION_PROCESS: "https://example.com/evidence-tracker"
  PRIVACY_REGULATIONS: "GDPR, CCPA, LGPD"
  DATA_INVENTORY_URL: "https://example.com/data-inventory"
  DPA_TEMPLATE_URL: "https://example.com/dpa-template"
  PRIVACY_BY_DESIGN_STANDARDS: "https://example.com/privacy-standards"
  USER_CONSENT_MANAGEMENT_TOOL: "OneTrust"
  AUDIT_FRAMEWORKS: "SOC2 Type II, ISO27001, HIPAA"
  AUDIT_EVIDENCE_TRACKER: "https://audits.example.com"
  AUDIT_COORDINATOR_EMAIL: "audit-coordination@example.com"
  REMEDIATION_TRACKING_SLA: "30 days"
  AUDIT_READINESS_GATE: "https://example.com/audit-readiness"
  BREACH_NOTIFICATION_WINDOW: "72"
  DSR_RESPONSE_WINDOW: "30"
---
## Deploying on a plain LLM API

1. Put the compiled prompt in the system slot (`system` field or the first system message). Every persona in this role (default, audit-coordinator, privacy-advocate) uses this same guide; compile and deploy each separately.
2. Start with `temperature: 0.2`, `max_tokens: 1500`. Temperature low for compliance precision; max_tokens moderate because compliance answers can be detailed but must stay actionable.
3. Inject context as plain text: the question type (regulation, evidence request, audit, breach), the regulatory framework in scope ({{REGULATORY_FRAMEWORKS}}), and any business context (customer location, data sensitivity, audit timeline). Fence pasted regulations or audit requests with `<<<UNTRUSTED ... >>>UNTRUSTED` markers.
4. Declare tools for compliance policy lookup, evidence tracking, and escalation. Do not allow the model to provide legal opinions; it must escalate legal interpretations to {{LEGAL_COUNSEL_CONTACT}}. For Audit Coordinator, add a calendar tool against {{AUDIT_EVIDENCE_TRACKER}} to detect overlapping fieldwork windows.
5. Test with four conversations: (1) interpret a {{REGULATORY_FRAMEWORKS}} requirement and map to controls; (2) track an evidence request for audit; (3) a potential breach notification that must escalate within {{BREACH_NOTIFICATION_WINDOW}} hours; (4) a data subject access or deletion request that must be tracked against {{DSR_RESPONSE_WINDOW}} days. All four must work before going live.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Regulatory text and policy lookup | Compliance interpretation | Yes |
| Evidence and remediation tracker | Audit tracking | Yes |
| Legal counsel escalation | Legal judgment and breach notification | Yes |
| Data inventory and classification | Privacy and data flow assessment | No (Privacy Advocate only) |
| Audit scheduling / calendar check | Multi-audit deconfliction | No (Audit Coordinator only) |
