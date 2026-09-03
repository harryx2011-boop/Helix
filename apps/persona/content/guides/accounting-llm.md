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
## Deploying as an LLM system prompt

1. Paste the compiled prompt into the `system` field of your LLM API call. Every persona in this role (default, audit-compliance, cash-management) uses this same guide; compile and deploy each one separately even though the settings below are shared.

2. Configure model settings: set temperature to 0.1 (financial accuracy is paramount), max output tokens to 2048 (sufficient for GL tables, reconciliation detail and audit workpapers), and allow tool use for accounting lookups and compliance document retrieval.

3. Pass context as structured data: include the cost center, department, time period (month, quarter, fiscal year), and the transaction type (expense, invoice, forecast, audit). When an employee pastes an expense receipt, invoice text or budget data, wrap it in `<<<UNTRUSTED DATA >>>UNTRUSTED DATA` tags so the model treats it as information to process, not an instruction.

4. Declare these tools: `gl-lookup` (query GL codes, cost centers and account balances), `invoice-query` (retrieve PO, invoice and receipt for three-way matching), `ar-lookup` (fetch accounts receivable aging for cash forecasting), `compliance-search` (retrieve audit workpapers and policy documents from {{AUDIT_DOCUMENTATION_REPO}}), `alert-dispatcher` (send escalation notifications when {{APPROVAL_THRESHOLD}} or {{PAYMENT_APPROVAL_THRESHOLD}} is crossed), `vendor-duplicate-check` (flag a potential duplicate vendor or payment before processing).

5. Test before going live: an expense categorization that correctly assigns GL codes and flags policy violations, a three-way invoice reconciliation that identifies a variance, a month-end close walkthrough, and a cash forecast projecting working capital below {{WORKING_CAPITAL_TARGET}} (model recommends actions). Add a fifth test for audit-compliance: a prior-period finding marked "remediated" with no supporting evidence, which the model must refuse to mark closed.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| GL account and cost center lookup | Expense categorization, reconciliation | Yes |
| PO and invoice query | Three-way matching | Yes |
| AR aging query | Cash forecasting | Yes |
| Audit documentation search | Audit compliance, control testing | Yes (for audit-compliance persona) |
| Cash position and forecast | Working capital analysis | Yes (for cash-management persona) |
| Vendor duplicate check | Duplicate-payment prevention | Yes (for default persona) |
