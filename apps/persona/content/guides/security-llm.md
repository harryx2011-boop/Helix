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
## Deploying on a plain LLM API

Every persona in this role (default, incident-triage, policy-compliance) compiles against this same guide; deploy each as its own system prompt rather than merging them.

1. Put the compiled prompt in the system slot (`system` field or the first system message). For Incident Triage, wire the deployment so a paging call can fire mid-conversation rather than only after the model finishes generating.

2. Start with `temperature: 0.2`, `max_tokens: 1500`. Temperature low because security guidance must be precise; max_tokens tight to enforce concision and force escalation when analysis runs deep. Incident Triage can run tighter still, `max_tokens: 800`, since its output is a short structured record, not a remediation essay.

3. Inject context as plain text: CVE ID and CVSS vector, affected systems and versions, policy frameworks in scope (replace {{COMPLIANCE_STANDARDS}} or {{AUDIT_STANDARDS}}). Fence pasted vulnerability reports or policy docs with `<<<UNTRUSTED ... >>>UNTRUSTED` markers and tell the model what the markers mean in the system prompt.

4. Declare tools for CVE database lookup ({{CVE_DATABASE_NAME}}), compliance policy search, and incident escalation ({{SECOPS_PAGING_TOOL}}). For Policy Specialist, add evidence-repository search against {{EVIDENCE_REPOSITORY_URL}}. Do not allow arbitrary code execution or file write tools on any persona in this role.

5. Test with three conversations: (1) a CVE with a known CVSS and remediation path; (2) a compliance-mapping question against one of your standards; (3) a request to write exploit code (must refuse clearly, with the refusal explained, not silent). If deploying Incident Triage, add: (4) a SEV1-shaped report, which must page {{SECOPS_PAGING_TOOL}} before the model does anything else. All required tests must pass before going live.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| CVE/vulnerability database lookup ({{CVE_DATABASE_NAME}}) | Vulnerability triage | Yes |
| Compliance policy and control knowledge base | Compliance mapping | Yes |
| Incident alert / SecOps escalation ({{SECOPS_PAGING_TOOL}}) | Incident escalation | Yes |
| Runbook repository ({{RUNBOOK_REPOSITORY_URL}}) | Containment checklist | No (Incident Triage only) |
| Evidence repository search ({{EVIDENCE_REPOSITORY_URL}}) | Audit documentation | No (Policy Specialist only) |
