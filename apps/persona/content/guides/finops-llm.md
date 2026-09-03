---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ACCOUNTING_SOFTWARE: "QuickBooks / Netsuite"
  BUDGET_ALERT_THRESHOLD: "10%"
  FORECAST_HORIZON: "3"
  COST_CENTER_LIST: "Engineering, Marketing, Sales, Operations"
  GL_CHART_URL: "https://docs.example.com/gl-chart"
  AP_APPROVAL_QUEUE: "Accounts Payable"
  INVOICE_DISPUTE_WINDOW: "10"
  SAVINGS_REVIEW_CADENCE: "Quarterly"
  ANNUAL_PLANNING_CYCLE: "FY26 Annual Plan"
  FORECAST_MODEL_REPOSITORY: "https://models.example.com/finops"
  SCENARIO_COUNT: "3"
  BOARD_REPORT_CADENCE: "Quarterly"
  FINANCE_LEAD_EMAIL: "finance-lead@example.com"
---
## Deploying as an LLM system prompt

1. Paste the compiled prompt into the `system` field of your LLM API call or the system-message field of your chat platform. Every persona in this role (default, cost-control, forecasting) uses this same guide; compile once and reuse.

2. Configure model settings: set temperature to 0.3 (financial accuracy and consistency over creativity), max output tokens to 2048 (enough for detailed budget tables), and allow tool use. FinOps personas must call accounting and forecasting tools to fetch current data; do not pre-load stale snapshots into the prompt.

3. Pass context as structured data: include the cost center name, the account or department requesting analysis, and the time period (month, quarter, fiscal year). When an employee pastes budget data, forecast assumptions or vendor terms, wrap the text in `<<<UNTRUSTED DATA >>>UNTRUSTED DATA` tags so the model treats it as input data, not an instruction.

4. Declare these tools: `account-lookup` (read-only GL and cost-center data from {{ACCOUNTING_SOFTWARE}}), `budget-query` (retrieve budget caps and thresholds by cost center), `forecast-generator` (project spend forward using historical patterns), `alert-dispatcher` (send budget-variance notifications when {{BUDGET_ALERT_THRESHOLD}} is crossed). For the Forecasting persona, also declare `scenario-model` (build {{SCENARIO_COUNT}} scenarios against two years of actuals) and route its output to {{FORECAST_MODEL_REPOSITORY}} rather than only the chat transcript.

5. Test before going live: a monthly spend report that correctly flags a {{BUDGET_ALERT_THRESHOLD}} variance, a cost-center forecast over three months, and a budget-override request that the model refuses (offers escalation to finance manager instead). If deploying Forecasting, add a fourth test: a request for the {{BOARD_REPORT_CADENCE}} reporting package, which must show the variance narrative against the last cycle's base case, not just a fresh projection.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Account lookup (GL codes, cost center) | Budget analysis, categorization | Yes |
| Budget query (caps, thresholds) | Variance analysis, alerts | Yes |
| Forecast generator | Spend projections | Yes |
| Alert dispatcher (email, Slack) | Proactive notifications | Yes |
| Scenario model ({{FORECAST_MODEL_REPOSITORY}}) | Long-range scenario planning | No (Forecasting only) |
| Board reporting export | Quarterly leadership package | No (Forecasting only) |
