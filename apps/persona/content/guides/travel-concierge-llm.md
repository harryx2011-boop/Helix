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
## Deploying on an LLM API

1. Paste the compiled prompt for your chosen travel-concierge persona into the system field (for OpenAI, the `system` role message; for Claude, the `system` input). Start with the persona matching your use case: Itinerary Planner for itinerary building, Rebooking and Disruption Agent for disruption handling, Loyalty and Points Advisor for rewards programs, or Destination Q&A Specialist for location guidance.

2. Start with these settings and adjust based on your use case:
   - **Temperature: 0.7** — balances factual accuracy (itineraries, policies, visa rules) with conversational warmth. Lower to 0.5 if you need strict policy adherence; raise to 0.8 for more exploratory travel planning.
   - **Max tokens: 1000** — travel guidance is typically conversational; longer responses occur only when walking through multi-day itineraries or rebooking scenarios.
   - **Tool use: enabled** — the prompt calls tools to check bookings, search availability, verify policies and escalate. Declare all tools before starting conversations.

3. Pass context as structured data in a header before the customer's first message:
   - **Booking context (for rebooking / disruption):** booking reference, flight number, current location, intended destination, time of incident.
   - **Account context (for loyalty workflows):** membership number, current tier, points balance, upcoming expiry.
   - **Destination context (for Q&A):** destination, travel dates, nationality (for visa checks), accessibility needs.
   - Fence any pasted documents (confirmation emails, booking PDFs) as `<<<UNTRUSTED context_source: email >>>` so the model treats them as data, not instructions.

4. Declare these tools before the first conversation:
   - **Booking lookup:** fetch booking details by reference or flight number. Returns itinerary, passenger list, modification history.
   - **Availability search:** search flights, hotels and experiences by route, dates and preferences. Returns cost, departure times, inventory level.
   - **Policy lookup:** retrieve cancellation, rebooking and refund rules by scenario (flight cancellation, customer cancellation, force-majeure).
   - **Points balance and redemption search:** retrieve account balance, expiry dates, redemption options by points value.
   - **Escalation and handoff:** trigger an escalation summary to {{ESCALATION_EMAIL}} or {{REBOOKING_QUEUE}} with session details and customer contact.
   - **Visa and entry checker:** verify visa requirements by nationality and destination (optional; enhance destination Q&A).
   - **Weather and climate:** retrieve historical and current weather by destination and date range (optional; enhance destination Q&A).

5. Test with these three conversations before going live:
   - **Itinerary building:** A customer plans a 10-day trip to Italy and Spain in June. The model should propose a day-by-day itinerary, account for travel time, suggest rest days, and identify jet-lag risk. Verify it respects {{MAX_ITINERARY_DAYS}} and does not promise bookings.
   - **Rebooking scenario:** A customer's flight is cancelled 6 hours before departure. The model should retrieve the booking, apply {{BOOKING_POLICY_URL}}, and propose rebooking or refund options. Verify it escalates to {{REBOOKING_QUEUE}} before confirming any changes.
   - **Escalation failure:** A customer asks for a refund outside {{POLICY_REFUND_WINDOW}} days. The model must escalate instead of approving or promising. Verify the escalation reaches {{ESCALATION_EMAIL}} with the customer contact and summary.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Booking lookup | Itinerary review, rebooking, account queries | Yes |
| Availability search | Itinerary building, rebooking options | Yes |
| Points balance check | Loyalty workflows | Yes |
| Policy lookup | Refunds, rebooking, cancellations | Yes |
| Escalation handoff | All workflows (when escalation triggers) | Yes |
| Visa/entry checker | Destination Q&A | No |
| Weather/climate data | Destination Q&A | No |
| Currency converter | Cost planning, destination Q&A | No |
