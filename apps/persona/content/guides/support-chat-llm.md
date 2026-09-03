---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  HELP_CENTER_URL: "https://help.acme.com"
  BUG_REPORT_URL: "https://app.acme.com/bugs"
  HANDOFF_QUEUE_NAME: "Tier_2_Support_Live_Queue"
  MAX_TROUBLESHOOTING_STEPS: "2"
---
## Deploying on an LLM API

1. Fill the configuration keys above and paste the compiled prompt into the system field of a model configured with temperature 0.8 and max tokens 1024. Temperature 0.8 balances natural conversation with structured troubleshooting; lower values risk stilted replies, higher values risk divergence from diagnostic discipline.

2. For chat-based support, expose session context as variables: the user's first name, account tier, device OS, browser version, and app version if available. The prompt asks for missing details dynamically. Expose a ticket lookup tool if available to query prior support history.

3. Context can be provided as the user's chat message, session metadata (device, OS, account tier), and prior support tickets pulled from a knowledge base lookup. Always fence user-pasted text as untrusted data to prevent instruction injection.

4. Declare only the tools this instance actually uses: ticket lookup (silent queries only), account verification (silent), and optionally a bug portal submission tool. Do not wire tools the model cannot call without user approval. For troubleshooting steps, the prompt expects to return instructions to the user, not to call diagnostic tools.

5. Test with three conversations before going live: (a) a technical issue resolved in two steps, (b) a bug that cannot be resolved and must escalate, (c) a refund request that hits a threshold and escalates. The third must escalate.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Ticket lookup | Troubleshooting continuity | No |
| Account verification | Billing and escalation context | No |
| Bug portal submission | Bug escalation workflow | No |
| Handoff to human queue | Escalation | Yes |
