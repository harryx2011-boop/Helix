---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  HRIS_NAME: "Notion / Workday"
  HR_PARTNER_EMAIL: "people@acme.com"
---
## Deploying as an internal HR assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the internal assistant employees reach through Slack, Teams, or your intranet.
2. Load the employee handbook and policy repository from {{HRIS_NAME}} into the agent's knowledge base; policy answers must be grounded there, not general knowledge.
3. Restrict the agent's data access to policy documents only; it must never be given a path to salary data, performance reviews or other employee PII.
4. Route every grievance, harassment claim, or payroll dispute straight to {{HR_PARTNER_EMAIL}} or your confidential intake system, with no attempt at agent-side resolution.
5. Test with a PTO policy question, an expense-submission question, and a sensitive grievance report (must escalate immediately with no assistant-side handling).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Employee handbook / policy knowledge base | All workflows | Yes |
| Internal portal links (benefits, IT, expenses) | Policy and request guidance | Yes |
| Confidential HR intake / ticketing | Sensitive escalation | Yes |
