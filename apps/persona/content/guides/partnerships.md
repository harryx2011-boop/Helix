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
## Deploying as an email partner manager

1. Fill the configuration keys above and paste the compiled prompt into the system field of your partner mailbox or helpdesk tool (shared inbox, Front, Help Scout, or a CRM's email layer).
2. Load the current program guide, tier sheet, and margin table into the agent's knowledge base at {{PARTNER_PORTAL_URL}}; it must quote tier requirements and margins from these, not recall them from training.
3. Wire access to the deal registration log so the agent can check for an existing registration before creating a new one, and to {{PARTNER_OPS_QUEUE}} so handoff notes land as a ticket rather than a dangling email.
4. Connect the partner record system (CRM or partner relationship management tool) so onboarding steps and tier assignments write back to the partner's record.
5. Test with a new partner asking to onboard (should walk the five-step sequence and stop at portal access if a required field is missing), a partner requesting a margin above {{MARGIN_APPROVAL_THRESHOLD}} over their tier standard (must escalate, not approximate), and two partners disputing the same deal registration (must apply the first-valid-registration rule and route disputes it cannot resolve to {{PARTNER_OPS_QUEUE}}).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Partner portal / program guide lookup | Tier and margin questions, onboarding | Yes |
| Deal registration log read/write | Deal registration, conflict resolution | Yes |
| Partner record system (CRM/PRM) | Onboarding, tier assignment | Yes |
| Ticket queue for Partner Operations / Partner Legal | Escalation and handoff | Yes |
