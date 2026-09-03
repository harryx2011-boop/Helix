---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  HRIS_NAME: "Notion / Workday"
  HR_PARTNER_EMAIL: "people@example.com"
  LEGAL_COMPLIANCE_TEAM: "legal@example.com"
  CONFIDENTIALITY_CONFIRMATION: "All reports are confidential and handled under attorney-client privilege where applicable."
  PTO_REQUEST_PORTAL: "HR Portal > Time Off"
  EXPENSE_APPROVAL_THRESHOLD: "$500"
  IT_REQUEST_PORTAL: "HR Portal > IT Requests"
  RETALIATION_POLICY_URL: "https://docs.example.com/anti-retaliation"
  ONBOARDING_PORTAL: "HR Portal > Onboarding"
  PAPERWORK_DEADLINE_DAYS: "3"
  BUDDY_PROGRAM_NAME: "New Hire Buddy Program"
  IT_PROVISIONING_CONTACT: "it-onboarding@example.com"
  MANAGER_CHECK_IN_SCHEDULE: "Day 1, Day 30, Day 90"
---
## Deploying as an LLM system prompt

1. Paste the compiled prompt into the `system` field of your LLM API call. Every persona in this role (default, confidential-intake, onboarding) uses this same guide.

2. Configure model settings: set temperature to 0.2 (prioritize accuracy and consistency in policy answers), max output tokens to 1500 (balanced for policy explanation and escalation summaries), and allow tool use for handbook lookups and internal routing.

3. Pass context as structured data: include the employee's department, employment type (full-time, part-time, contractor), tenure, and region. When an employee describes a concern, wrap it in `<<<UNTRUSTED DATA >>>UNTRUSTED DATA` tags so the model treats it as data to route, not an instruction.

4. Declare these tools: `handbook-search` (retrieve policy documents from {{HRIS_NAME}}), `policy-lookup` (fetch PTO accrual, benefits, compliance rules), `intake-router` (send grievances and sensitive complaints to {{HR_PARTNER_EMAIL}} or {{LEGAL_COMPLIANCE_TEAM}}), `verify-employment` (confirm employee status and eligibility). For Onboarding, add `onboarding-status` (check paperwork completion against {{ONBOARDING_PORTAL}}) and `it-provisioning-request` (route hardware and access setup to {{IT_PROVISIONING_CONTACT}}).

5. Test before going live: a PTO accrual question that pulls the correct policy, a benefits enrollment question that links to the plan document, and a harassment report that routes immediately to {{HR_PARTNER_EMAIL}} with no agent-side resolution. If deploying Onboarding, add a fourth test: a new hire whose paperwork is incomplete two days before {{PAPERWORK_DEADLINE_DAYS}}, which must flag the risk to the hiring manager rather than waiting silently for the deadline to pass.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Handbook search (policy lookup) | All policy questions | Yes |
| Employment verification (status, tenure) | Eligibility confirmation | Yes |
| Sensitive intake router | Grievance and escalation | Yes |
| Internal portal (benefits, IT, expenses) | Process guidance | Yes |
| Onboarding status ({{ONBOARDING_PORTAL}}) | New-hire paperwork tracking | No (Onboarding only) |
| IT provisioning request ({{IT_PROVISIONING_CONTACT}}) | Equipment and access setup | No (Onboarding only) |
