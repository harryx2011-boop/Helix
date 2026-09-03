---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  COMPLIANCE_STANDARDS: "SOC2 Type II, ISO27001, GDPR"
  SECURITY_DISCLOSURE_EMAIL: "security@acme.com"
  CVE_DATABASE_NAME: "NVD / Snyk"
  PATCH_SLA_CRITICAL: "24"
  SECOPS_PAGING_TOOL: "PagerDuty"
  INCIDENT_SEVERITY_SLA: "SEV1: 15 min, SEV2: 1 hr, SEV3: 4 hr"
  RUNBOOK_REPOSITORY_URL: "https://runbooks.example.com"
  STATUS_PAGE_TOOL: "Statuspage"
  AUDIT_STANDARDS: "SOC2 Type II, ISO27001, HIPAA"
  EVIDENCE_REPOSITORY_URL: "https://control-tracker.example.com"
  POLICY_OWNER_EMAIL: "compliance@example.com"
  AUDIT_READINESS_CHECKLIST: "https://control-tracker.example.com/readiness"
  AUDIT_CYCLE_LENGTH: "12"
---
## Deploying as a security and compliance assistant

This role covers three personas: the default triage-and-compliance agent, the Incident Triage first-responder, and the Policy Specialist who prepares audit documentation. All three share this platform guide; the workflow below applies to the whole role, with persona-specific notes called out.

1. Fill the configuration keys above and paste the compiled prompt into the system field of the chat or docs assistant your security team uses. If you are deploying more than one persona, compile each separately; do not merge their prompts into one system message.

2. Load NIST, the OWASP Top 10, and your own {{COMPLIANCE_STANDARDS}} or {{AUDIT_STANDARDS}} policy documents into the agent's knowledge base. Every persona in this role must map controls to real, verified policy, not general knowledge about "typical" security practice.

3. Connect a CVE or vulnerability database lookup tool ({{CVE_DATABASE_NAME}}) so triage cites a real CVSS score rather than an estimate. For the Incident Triage persona, also connect {{SECOPS_PAGING_TOOL}} directly so a SEV1 or SEV2 pages a human without waiting on this workflow to be re-run manually.

4. Route every active-incident trigger to {{SECURITY_DISCLOSURE_EMAIL}} or {{SECOPS_PAGING_TOOL}} immediately; this workflow should never wait on a human to notice. For the Policy Specialist persona, route audit-gap findings to {{POLICY_OWNER_EMAIL}} instead, since that persona does not handle live incidents.

5. Test with a CVE triage request, a compliance-mapping question against {{COMPLIANCE_STANDARDS}}, and a request to write an exploit (must be refused with an explanation, not a silent decline). If deploying Incident Triage, add a fourth test: a SEV1-shaped report that must page {{SECOPS_PAGING_TOOL}} before anything else happens in the conversation.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| CVE / vulnerability database lookup ({{CVE_DATABASE_NAME}}) | Vulnerability triage | Yes |
| Compliance policy knowledge base | Compliance mapping | Yes |
| SecOps paging / incident tool ({{SECOPS_PAGING_TOOL}}) | Incident escalation | Yes |
| Runbook repository ({{RUNBOOK_REPOSITORY_URL}}) | Containment guidance | No (Incident Triage only) |
| Audit evidence tracker ({{EVIDENCE_REPOSITORY_URL}}) | Audit documentation | No (Policy Specialist only) |
