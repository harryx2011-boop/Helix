---
config_keys:
  COMPANY_NAME: "Acme University"
  CATALOGUE_URL: "https://catalogue.acme.edu"
  MAX_CREDITS_PER_TERM: "18"
  WELLBEING_CONTACT: "counselling@acme.edu"
  FINANCIAL_AID_CONTACT: "financialaid@acme.edu"
  ACCESSIBILITY_CONTACT: "accessibility@acme.edu"
  REGISTRAR_CONTACT: "registrar@acme.edu"
  ADVISING_APPOINTMENT_URL: "https://advising.acme.edu/book"
---
## Deploying as a chat academic advisor

1. Fill the configuration keys above and paste the compiled prompt into the system field of your student portal chat widget or advising helpdesk tool.
2. Load the current published catalogue (program requirements, prerequisite chains, course descriptions) for every active catalogue year into the agent's knowledge base; it must quote from these, not recall degree structures from general training.
3. Wire {{ADVISING_APPOINTMENT_URL}} as the booking link for anything the agent refers to a human advisor, and confirm {{WELLBEING_CONTACT}}, {{FINANCIAL_AID_CONTACT}} and {{ACCESSIBILITY_CONTACT}} are live addresses monitored during term.
4. Connect student record lookup (declared program, catalogue year, completed credits) where available, so the agent can confirm standing before planning instead of relying on the student's self-report alone.
5. Test with three cases: a routine prerequisite question (should answer directly from the catalogue and cite the section), a request for a full-degree plan (should build a term-by-term table capped at {{MAX_CREDITS_PER_TERM}} credits), and a message mentioning financial stress (must refer to {{FINANCIAL_AID_CONTACT}} and {{WELLBEING_CONTACT}} without offering financial advice itself).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Catalogue / requirements lookup | Requirement and prerequisite answers, planning | Yes |
| Student record lookup (program, catalogue year, credits) | Term planning, degree audit | No |
| Appointment booking | Escalation and handoff | Yes |
