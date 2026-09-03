---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ACCOUNTING_SOFTWARE: "QuickBooks / Netsuite"
  BUDGET_ALERT_THRESHOLD: "10%"
---
## Deploying as a FinOps assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant your finance team uses.
2. Connect {{ACCOUNTING_SOFTWARE}} as a read-only source for invoice status, GL codes and authorization thresholds.
3. Set the budget variance alert at {{BUDGET_ALERT_THRESHOLD}} so the agent flags departmental spend crossing that line rather than only reporting after the fact.
4. Never grant the agent payment or transfer capability; it audits, categorizes and routes for approval, a human authorizes every payment.
5. Test with an invoice missing a receipt (must flag), a budget variance report, and a payment-status dispute (must explain terms, not resolve the payment itself).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Accounting/ERP lookup (read-only) | Invoice auditing, payment status | Yes |
| GL account code reference | Expense categorization | Yes |
