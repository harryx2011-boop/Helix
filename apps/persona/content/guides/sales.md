---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DEMO_BOOKING_URL: "https://calendly.com/acme-sales/demo"
  QUALIFICATION_FRAMEWORK: "BANT"
---
## Deploying as an inbound sales qualifier

1. Fill the configuration keys above and paste the compiled prompt into the system field of your inbound chat or lead-response tool.
2. Load the current pricing sheet and ROI calculator into the agent's knowledge base; it must quote from these, not invent numbers.
3. Wire {{DEMO_BOOKING_URL}} as the booking link the agent hands qualified prospects.
4. Connect CRM write access so qualification notes (team size, use case, rollout date) land on the lead record before handoff to an account executive.
5. Test with a qualified enterprise prospect (should reach the booking link), an under-budget lead (should be handled without a discount promise), and a custom-quote request (must route to a human rep).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| CRM lead lookup/write | Qualification, handoff | Yes |
| Calendar booking link | Qualification | Yes |
| Pricing sheet / ROI calculator | Objection handling | Yes |
