---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DEMO_BOOKING_URL: "https://calendly.com/acme-sales/demo"
  QUALIFICATION_FRAMEWORK: "BANT"
  CRM_NAME: "Salesforce"
  PRICING_SHEET_URL: "https://acme.com/pricing"
  PROSPECT_LIST_SOURCE: "LinkedIn Sales Navigator"
  DO_NOT_CONTACT_LIST: "competitors-and-customers.csv"
  OUTREACH_TEMPLATE_URL: "https://playbook.acme.com/templates"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.7 (conversational but coherent), max tokens 1000 (sales messages are typically brief), and allow tool use for CRM lookups and calendar checks.
3. Pass context as variables: prospect name, company, role, prior interactions from your CRM. The prompt will ask for missing details; do not inject them—let the model request them in conversation.
4. Declare tools: CRM lead lookup/create, calendar availability check, pricing sheet retrieval, and do-not-contact list verification. The prompt names them as such; your tool definitions should match.
5. Test before deployment: a qualified enterprise prospect (should reach the booking link), an under-qualified lead (should not over-promise), a custom-quote request (must escalate), and a competitor name (must check do-not-contact list).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| CRM lead lookup/create | Qualification, handoff | Yes |
| Calendar booking availability | Demo scheduling | Yes |
| Pricing sheet or ROI calculator | Objection handling | Yes |
| Do-not-contact list check | All outreach | Yes |
