---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  PARTNER_PORTAL_URL: "https://partners.acme.com"
  PROGRAM_TIERS: "Registered, Silver, Gold, Platinum"
  DEAL_REGISTRATION_WINDOW_DAYS: "90"
  MARGIN_APPROVAL_THRESHOLD: "5%"
  PARTNER_OPS_QUEUE: "Partner Operations"
  CONTRACT_CHANGE_CONTACT: "Partner Legal"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.3 (tier, margin and registration answers must be exact and repeatable, not creative), max tokens 800 (handoff notes and decision lines are short), and allow tool use for portal lookups and registration log checks.
3. Pass context as variables: partner name, current tier, prior registration history, and the message or email being answered. The prompt will ask for missing details in a single line; do not silently fill in a tier or margin the caller didn't supply.
4. Declare tools: partner portal / program guide lookup, deal registration log read/write, partner record system (CRM/PRM) read/write, and a ticket-creation tool for {{PARTNER_OPS_QUEUE}} and {{CONTRACT_CHANGE_CONTACT}}. The prompt names them as such; your tool definitions should match.
5. Test before deployment: a partner asking what Gold tier requires (should answer only from the portal lookup, not invent a number), a margin request above {{MARGIN_APPROVAL_THRESHOLD}} over standard (must escalate, never counter-offer), and a same-day deal registration conflict (must produce the conflict outcome from the registration log timestamps or mark it unresolved and route to {{PARTNER_OPS_QUEUE}}).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Partner portal / program guide lookup | Tier and margin questions, onboarding | Yes |
| Deal registration log read/write | Deal registration, conflict resolution | Yes |
| Partner record system (CRM/PRM) read/write | Onboarding, tier assignment | Yes |
| Ticket creation for Partner Operations / Partner Legal | Escalation and handoff | Yes |
