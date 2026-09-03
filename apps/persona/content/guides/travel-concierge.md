---
config_keys:
  COMPANY_NAME: "Acme Travel"
  TIMEZONE: "UTC"
  MAX_ITINERARY_DAYS: "30"
  BOOKING_POLICY_URL: "https://policies.acme-travel.com/booking"
  ESCALATION_EMAIL: "escalations@acme-travel.com"
  TRAVEL_INSURANCE_PROVIDER: "SafeTravel Inc"
  CUSTOMER_SUPPORT_HOURS: "24/7"
  POLICY_REFUND_WINDOW: "7"
  REBOOKING_QUEUE: "Rebooking_Live"
  MAX_REBOOK_DELAY_HOURS: "6"
  LOYALTY_PROGRAM_NAME: "Acme Rewards"
  POINTS_PER_DOLLAR: "1"
  POINTS_REDEMPTION_URL: "https://rewards.acme-travel.com"
  ELITE_TIER_THRESHOLD: "$5000"
  ELITE_BENEFITS: "Free upgrades, lounge access, priority support"
  REDEMPTION_RATIO: "100"
  VISA_REQUIREMENTS_URL: "https://www.gov.uk/visas"
  TRAVEL_ADVISORY_URL: "https://travel.state.gov"
  ACCESSIBILITY_GUIDE_URL: "https://access.acme-travel.com"
  CURRENCY_DATA_SOURCE: "XE.com"
  CURRENT_TRAVEL_MONTH: "September 2026"
  POINTS_POSTING_WINDOW_DAYS: "7"
  URGENT_DEPARTURE_WINDOW_HOURS: "2"
---
## Deploying in a chat widget

1. Fill the configuration keys above. The wizard substitutes them into the compiled prompts for all four travel-concierge personas.
2. Paste the compiled prompt into the system-instructions field of your chat engine (Intercom Fin, Zendesk AI, a custom LLM behind your widget).
3. Expose session context to the model as variables: the signed-in user's first name, account tier (if applicable), and current location (optional). The prompt asks for these only when they are missing.
4. Wire the escalation path: prompts ending with "hand off to {{ESCALATION_EMAIL}}" should trigger a summary to that email address with the session history and customer contact information.
5. Test with four conversations covering each persona's workflow: an itinerary request, a rebooking scenario, a points inquiry, and a destination question. Verify escalations reach the correct queue.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Booking lookup | Rebooking, account status | Yes |
| Availability search | Itinerary building, rebooking | Yes |
| Points balance check | Loyalty workflows | Yes |
| Policy lookup | Refunds, rebooking, cancellations | Yes |
| Escalation handoff | All workflows (escalation trigger) | Yes |
| Visa/entry checker | Destination Q&A | No |
| Weather data | Destination Q&A | No |
| Currency converter | Destination Q&A, cost planning | No |
