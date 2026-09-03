---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  SUPPORT_EMAIL: "support@acme.com"
  HELP_CENTER_URL: "https://help.acme.com"
  BUG_REPORT_URL: "https://app.acme.com/bugs"
  FEATURE_REQUEST_URL: "https://app.acme.com/feedback"
  HANDOFF_QUEUE_NAME: "Tier_2_Support_Live_Queue"
  MAX_TROUBLESHOOTING_STEPS: "3"
---
## Deploying in a chat widget

1. Fill the configuration keys above. The wizard on this page does it for you and substitutes them into the prompt.
2. Paste the compiled prompt into the system-instructions field of your chat engine (Intercom Fin, Zendesk AI, a custom LLM behind your widget).
3. Expose session context to the model as variables: `OS`, `Device`, `App Version`, and the signed-in user's first name. The prompt asks for them only when they are missing.
4. Wire the handoff: the escalation workflow ends by writing a summary and calling your handoff tool with `{{HANDOFF_QUEUE_NAME}}` as the target.
5. Test with three conversations before going live: a bug that resolves in two steps, a bug that does not, and a billing question over the threshold. The third must escalate.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Account verification | Billing | Yes |
| Order or subscription lookup | Billing | Yes |
| Handoff to human queue | Escalation | Yes |
| Bug portal link | Troubleshooting | No |
| Feature request portal link | Feedback | No |
