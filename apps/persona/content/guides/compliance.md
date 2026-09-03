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
---
## Deploying on an email compliance platform

1. Fill the configuration keys above and paste the compiled prompt into the system field of your compliance and audit email assistant (Zendesk, custom ticketing system, or email interface).
2. Expose context: the email subject, regulatory framework referenced ({{REGULATORY_FRAMEWORKS}}), and any attachments (evidence, policies, audit requests). The prompt uses this to route to the correct workflow.
3. Connect tools: policy repository search ({{COMPLIANCE_POLICY_REPOSITORY}}), evidence tracker ({{EVIDENCE_SUBMISSION_PROCESS}} or {{AUDIT_EVIDENCE_TRACKER}}), and legal escalation ({{LEGAL_COUNSEL_CONTACT}}). The prompt calls these to verify answers and escalate complex questions. For the Privacy Advocate persona, also connect {{DATA_INVENTORY_URL}} and the {{USER_CONSENT_MANAGEMENT_TOOL}} so consent-flow guidance reflects what is actually implemented.

4. Set response SLAs: regulatory questions should receive first-response within 1 business day; evidence requests within 2 business days; a confirmed breach must reach {{LEGAL_COUNSEL_CONTACT}} within the {{BREACH_NOTIFICATION_WINDOW}}-hour regulatory clock, not the standard SLA. Track every escalation to legal in the same system, not a side channel.

5. Test with four emails: (1) a regulatory interpretation question; (2) an evidence request for an audit; (3) a potential breach notification that must escalate to {{LEGAL_COUNSEL_CONTACT}} inside {{BREACH_NOTIFICATION_WINDOW}} hours; (4) a data subject access request that must be tracked against the {{DSR_RESPONSE_WINDOW}}-day window.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Compliance policy and regulation repository | Question answering | Yes |
| Evidence and remediation tracker | Audit and gap tracking | Yes |
| Legal counsel escalation | Complex legal questions and breaches | Yes |
| Data inventory and classification ({{DATA_INVENTORY_URL}}) | Privacy impact assessment | No (Privacy Advocate only) |
| Consent management platform ({{USER_CONSENT_MANAGEMENT_TOOL}}) | Consent flow design | No (Privacy Advocate only) |
| Audit calendar / scheduling | Multi-audit deconfliction | No (Audit Coordinator only) |
