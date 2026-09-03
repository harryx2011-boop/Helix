---
config_keys:
  COMPANY_NAME: "Acme Real Estate"
  BROKERAGE_NAME: "Acme Realty"
  LISTING_DB_URL: "https://listings.acme-realty.com"
  MARKET_REPORTS_URL: "https://market.acme-realty.com"
  AGENT_CONTACT_METHOD: "Fill the contact form or call 555-1234"
  HANDOFF_QUEUE_NAME: "Listing Desk"
  FAIR_HOUSING_POLICY_URL: "https://policies.acme-realty.com/fair-housing"
  MAX_TROUBLESHOOTING_STEPS: "2"
  VIEWING_SYSTEM_URL: "https://viewings.acme-realty.com"
  CONFIRMATION_EMAIL_DOMAIN: "viewings@acme-realty.com"
  CANCELLATION_WINDOW_HOURS: "24"
  PROPERTY_SHOWING_RULES_URL: "https://rules.acme-realty.com/showings"
  LENDER_PARTNER_URL: "https://lenders.acme-realty.com"
  BUYING_GUIDE_URL: "https://guides.acme-realty.com/buying"
  AGENT_REFERRAL_FORM: "https://connect.acme-realty.com/agents"
  QUALIFICATION_THRESHOLD: "$100,000"
  MAINTENANCE_REQUEST_URL: "https://maintenance.acme-pm.com"
  EMERGENCY_MAINTENANCE_PHONE: "555-9111"
  TENANT_PORTAL_URL: "https://tenant.acme-pm.com"
  PROPERTY_MANAGER: "Acme Property Management"
  STATE_TENANT_RIGHTS_URL: "https://rights.state.gov/tenant"
---
## Deploying in a chat or email interface

1. Fill the configuration keys above. The wizard substitutes them into the compiled prompts for all four real-estate personas; unfilled keys stay visible as `{{KEY}}` so nothing ships with a placeholder silently blank.
2. Paste the compiled prompt into the system-instructions field of your chat widget, email template engine, or LLM backend. Pick the persona matching the surface: Listing Q&A Agent for general inquiries, Viewing Scheduler for booking, Buyer Qualification Agent for lead intake, Tenant Support Agent for existing renters.
3. Expose session or email context to the model: signed-in user name, property or listing ID in view, and prior interactions (viewings booked, prior tickets). For email, include the thread subject and prior correspondence.
4. Wire fair-housing compliance before launch: confirm no tool, data source, or configuration variable encodes a protected characteristic (race, religion, familial status, disability, national origin). Every persona in this role refuses requests to filter, steer or apply different treatment on that basis as a firm, named policy — verify that refusal fires in testing, not just that it reads correctly in the prompt.
5. Run one live conversation per persona before go-live: a listing Q&A, a viewing booking end to end, a buyer qualification intake, and a tenant maintenance ticket. Confirm each escalation lands in its stated queue and that the fair-housing refusal triggers on a deliberately steering test message.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Listing database | Q&A, listing summaries, market context | Yes |
| Viewing scheduler | Booking, confirmation, rescheduling | Yes |
| Buyer qualification checklist | Readiness assessment, pre-approval status | Yes |
| Agent directory and referral | Agent matching, connection | Yes |
| Maintenance request system | Tenant maintenance intake and tracking | Yes |
| Fair housing validator | All workflows, compliance gate on every output | Yes |
| Market data | Price trends, neighborhood context | No |
| Lender partner directory | Pre-approval referral | No |
