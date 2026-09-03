---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ACCOUNTING_SYSTEM: "QuickBooks / Netsuite"
  GL_CHART_URL: "https://docs.example.com/gl-chart"
  EXPENSE_POLICY_URL: "https://docs.example.com/expenses"
  APPROVAL_THRESHOLD: "$5,000"
  MONTH_END_CHECKLIST: "Reconcile all GL accounts, review accruals, verify expense reports"
  AUDIT_FRAMEWORK: "SOC 2 Type II"
  AUDIT_DOCUMENTATION_REPO: "https://docs.example.com/audit"
  REGULATORY_CONTACT: "compliance@example.com"
  AUDIT_RETENTION_PERIOD: "7"
  CASH_FORECASTING_HORIZON: "30"
  WORKING_CAPITAL_TARGET: "45"
  PAYMENT_APPROVAL_THRESHOLD: "$50,000"
  BANKING_RELATIONSHIP_CONTACT: "banking@example.com"
---
## Deploying accounting agents via email and chat

1. Fill the configuration keys above and paste the compiled prompt into the system field of the model that handles expense submissions, invoice processing, audit support and cash forecasting.

2. Load {{ACCOUNTING_SYSTEM}} as a read-only source: the model must query GL data, expense records, invoice status, purchase orders and AR aging to perform categorization, three-way matching and reconciliation. Connect {{GL_CHART_URL}} and {{AUDIT_FRAMEWORK}} documentation as knowledge sources.

3. Email is asynchronous; chat is real-time Q&A: instruct email pipelines to send one complete response per expense or invoice (categorization, approval status, next steps). For chat, allow multi-turn question-and-answer and iterative reconciliation.

4. Route escalations: policy exceptions and transactions above {{APPROVAL_THRESHOLD}} go to the finance manager. Audit-compliance questions go to {{REGULATORY_CONTACT}}. Cash forecasting that requires line-of-credit approval goes to {{BANKING_RELATIONSHIP_CONTACT}}.

5. Test before going live: an expense with a missing receipt (model flags and requests documentation), a three-way invoice match with a quantity variance (model identifies and recommends resolution), a month-end close checklist (model walks through all items), and a cash forecast showing working capital below {{WORKING_CAPITAL_TARGET}} (model recommends actions, then escalates to {{BANKING_RELATIONSHIP_CONTACT}} if the shortfall persists past {{CASH_FORECASTING_HORIZON}} days).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| GL account lookup | Expense categorization | Yes |
| PO and invoice query | Three-way matching | Yes |
| AR aging detail | Cash forecasting | Yes |
| Cost center and project codes | Expense assignment | Yes |
| Audit workpaper repository ({{AUDIT_DOCUMENTATION_REPO}}) | Audit support | No (audit-compliance only) |
| Cash and banking data feed | Working capital analysis | No (cash-management only) |
