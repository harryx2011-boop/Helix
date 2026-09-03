---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ACCOUNTING_SOFTWARE: "QuickBooks / Netsuite"
  BUDGET_ALERT_THRESHOLD: "10%"
  GL_CHART_URL: "https://docs.example.com/gl-chart"
  AP_APPROVAL_QUEUE: "Accounts Payable"
  INVOICE_DISPUTE_WINDOW: "10"
  FORECAST_HORIZON: "3"
  COST_CENTER_LIST: "Engineering, Marketing, Sales, Operations"
  SAVINGS_REVIEW_CADENCE: "Quarterly"
  ANNUAL_PLANNING_CYCLE: "FY26 Annual Plan"
  FORECAST_MODEL_REPOSITORY: "https://models.example.com/finops"
  SCENARIO_COUNT: "3"
  BOARD_REPORT_CADENCE: "Quarterly"
  FINANCE_LEAD_EMAIL: "finance-lead@example.com"
---
## Deploying as a FinOps assistant

This role covers three personas: the default invoice-and-variance auditor, the Cost Control persona for month-to-quarter forecasting and department coaching, and the Forecasting persona for long-range scenario modeling. All three share this platform guide.

1. Fill the configuration keys above and paste the compiled prompt into the system field of the docs or chat assistant your finance team uses. Compile each persona's prompt separately even though they share this guide.

2. Connect {{ACCOUNTING_SOFTWARE}} as a read-only source for invoice status, GL codes from {{GL_CHART_URL}}, and authorization thresholds. The Forecasting persona additionally needs read access to two years of historical actuals, not just the trailing period the default agent uses.

3. Set the budget variance alert at {{BUDGET_ALERT_THRESHOLD}} so the default and Cost Control personas flag departmental spend crossing that line rather than only reporting after the fact. Configure {{FORECAST_HORIZON}} for month-to-quarter projections and {{SCENARIO_COUNT}} for the Forecasting persona's annual scenarios.

4. Never grant any FinOps persona payment or transfer capability; every persona audits, categorizes, forecasts, or routes for approval, and a human authorizes every payment through {{AP_APPROVAL_QUEUE}}. Route long-range planning outputs through {{FINANCE_LEAD_EMAIL}} before they reach the board on the {{BOARD_REPORT_CADENCE}}.

5. Test with an invoice missing a receipt (must flag), a budget variance report (must flag anything over {{BUDGET_ALERT_THRESHOLD}}), a payment-status dispute (must explain terms, not resolve the payment itself), and, if deploying Forecasting, a request to see the model's underlying assumptions (must state them plainly, not hide them behind a single number).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Accounting/ERP lookup (read-only) | Invoice auditing, payment status | Yes |
| GL account code reference ({{GL_CHART_URL}}) | Expense categorization | Yes |
| Historical actuals (2+ years) | Long-range forecasting | No (Forecasting only) |
| Forecast model repository ({{FORECAST_MODEL_REPOSITORY}}) | Scenario modeling | No (Forecasting only) |
