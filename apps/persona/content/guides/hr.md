---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  HRIS_NAME: "Notion / Workday"
  HR_PARTNER_EMAIL: "people@acme.com"
  PTO_REQUEST_PORTAL: "HR Portal > Time Off"
  EXPENSE_APPROVAL_THRESHOLD: "$500"
  IT_REQUEST_PORTAL: "HR Portal > IT Requests"
  LEGAL_COMPLIANCE_TEAM: "legal@example.com"
  CONFIDENTIALITY_CONFIRMATION: "All reports are confidential and handled under attorney-client privilege where applicable."
  RETALIATION_POLICY_URL: "https://docs.example.com/anti-retaliation"
  ONBOARDING_PORTAL: "HR Portal > Onboarding"
  PAPERWORK_DEADLINE_DAYS: "3"
  BUDDY_PROGRAM_NAME: "New Hire Buddy Program"
  IT_PROVISIONING_CONTACT: "it-onboarding@example.com"
  MANAGER_CHECK_IN_SCHEDULE: "Day 1, Day 30, Day 90"
---
## Deploying as an internal HR assistant

This role covers three personas: the default policy assistant, the Confidential Intake specialist for grievances and legal-risk reports, and the Onboarding agent for new-hire setup. All three share this platform guide but should never be merged into one prompt.

1. Fill the configuration keys above and paste the compiled prompt into the system field of the internal assistant employees reach through Slack, Teams, or your intranet. Deploy Confidential Intake behind a separate, clearly labeled entry point so employees know they are filing a sensitive report, not asking a routine question.

2. Load the employee handbook and policy repository from {{HRIS_NAME}} into the agent's knowledge base; policy answers must be grounded there, not general knowledge. For Onboarding, also load the standard new-hire checklist and link {{ONBOARDING_PORTAL}}.

3. Restrict every persona's data access to policy documents only; none of them should ever be given a path to salary data, performance reviews, or other employee PII beyond what a specific workflow explicitly needs (for example, Onboarding needs paperwork status, not compensation history).

4. Route every grievance, harassment claim, or payroll dispute straight to {{HR_PARTNER_EMAIL}} or {{LEGAL_COMPLIANCE_TEAM}} via the Confidential Intake persona, with no attempt at agent-side resolution. Route onboarding blockers (missed paperwork, IT delays) to {{IT_PROVISIONING_CONTACT}} or the hiring manager instead, since those are logistics, not sensitive matters.

5. Test with a PTO policy question (default persona), a sensitive grievance report (must escalate immediately with no assistant-side handling), and a new-hire's first-week schedule request (must produce a day-by-day agenda, not a vague overview).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Employee handbook / policy knowledge base | All workflows | Yes |
| Internal portal links (benefits, IT, expenses) | Policy and request guidance | Yes |
| Confidential HR intake / ticketing | Sensitive escalation | Yes |
| Onboarding checklist and portal status ({{ONBOARDING_PORTAL}}) | New-hire tracking | No (Onboarding only) |
