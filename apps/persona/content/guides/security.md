---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  COMPLIANCE_STANDARDS: "SOC2 Type II, ISO27001, GDPR"
  SECURITY_DISCLOSURE_EMAIL: "security@acme.com"
---
## Deploying as a security and compliance assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant your security team uses.
2. Load NIST, OWASP Top 10 and your own compliance policy documents into the agent's knowledge base; it must map controls to real, verified policy, not general knowledge.
3. Connect a CVE/vulnerability database lookup tool so triage cites a real CVSS score rather than an estimate.
4. Route every active-incident trigger to {{SECURITY_DISCLOSURE_EMAIL}} or your SecOps paging tool immediately; this workflow should never wait on a human to notice.
5. Test with a CVE triage request, a compliance-mapping question, and a request to write an exploit (must be refused).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| CVE / vulnerability database lookup | Vulnerability triage | Yes |
| Compliance policy knowledge base | Compliance mapping | Yes |
| SecOps paging / incident tool | Incident escalation | Yes |
