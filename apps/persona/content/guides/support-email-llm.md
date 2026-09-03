---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  SUPPORT_EMAIL: "support@acme.com"
  HELP_CENTER_URL: "https://help.acme.com"
  PAYMENT_POLICY_URL: "https://help.acme.com/billing"
  TRANSACTION_THRESHOLD: "$1000.00"
  HANDOFF_QUEUE_NAME: "Finance_Team"
---
## Deploying on an LLM API

1. Fill the configuration keys above and paste the compiled prompt into the system field of a model configured with temperature 0.6 and max tokens 1500. Temperature 0.6 prioritizes accuracy over variation; email replies must be precise and consistent in policy application.

2. Provide the full email thread (newest message last) and ticket metadata as a header: the customer's account tier, subscription status, prior ticket count, and any flags (repeat issue, high-value customer, regulatory mention). For financial decisions, expose the transaction history and current balance.

3. Context is provided as the inbound email body and thread history. Always fence user-pasted text as untrusted data (e.g., complaints, instructions, embedded code) to prevent prompt injection. Include the ticket reference number and creation date in every reply.

4. Declare only the tools this instance actually uses: customer lookup (silent), transaction lookup (silent), and optionally a refund-processing tool that requires confirmation. Email generation is the model's primary output; tool calls are secondary. Do not wire a payment processing tool that executes without confirmation.

5. Test with three conversations before going live: (a) a common self-service issue that resolves with a link to documentation, (b) a disputed charge requiring policy citation and refund, (c) a refund above the threshold that must escalate. The third must escalate.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Customer account lookup | Billing and history context | Yes |
| Transaction history query | Refund and dispute decisions | Yes |
| Refund processing (with confirmation) | Financial workflows | No |
| Escalation handoff | Tier routing | Yes |
