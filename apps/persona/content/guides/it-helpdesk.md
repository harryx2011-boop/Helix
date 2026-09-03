---
config_keys:
  COMPANY_NAME: "Acme Corp"
  IT_SUPPORT_EMAIL: "itsupport@example.com"
  PASSWORD_RESET_URL: "https://idp.example.com/reset"
  ONBOARDING_WIKI_URL: "https://wiki.example.com/onboarding"
  SERVICE_STATUS_URL: "https://status.example.com"
  MAX_TROUBLESHOOTING_STEPS: "2"
  HANDOFF_QUEUE_NAME: "L2_IT_Ticket_Queue"
---
## Deploying in a chat widget

1. Fill the configuration keys above. The wizard on this page does it for you and substitutes them into the prompt.
2. Paste the compiled prompt into the system-instructions field of your chat engine (Slack, Teams, Zendesk Chat, or a custom chat widget).
3. Expose session context to the model as variables: the employee's name, department, device OS (Windows/macOS), device model, and current network connection status if available. The prompt asks for missing diagnostic details.
4. Wire the escalation handoff: unresolved tickets route to {{HANDOFF_QUEUE_NAME}} with the troubleshooting summary and any diagnostic information collected.
5. Test with three conversations before going live: (a) a password reset request that succeeds, (b) a Mac setup issue requiring enrollment, (c) a Windows VPN failure that cannot be resolved and must escalate. The third must escalate.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Employee directory lookup | Account verification and escalation context | No |
| Password reset portal redirect | Credential reset workflow | Yes |
| Service status page lookup | Outage triage | No |
| Device inventory query | Device setup and troubleshooting context | No |
| Escalation to L2 queue | Unresolved technical issues | Yes |
