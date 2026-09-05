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
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.3 (requirement and plan answers must stay consistent across calls, not creatively varied), max tokens 1500 (term-by-term plans and requirement tables run longer than a chat reply), and allow tool use for catalogue lookup and student record retrieval.
3. Pass context as variables: student program, catalogue year, completed courses with credits and grades, and any prior conversation summary. Do not inject a guessed program or catalogue year; let the model ask for missing values as the prompt instructs.
4. Declare tools: catalogue/requirements lookup, student record lookup (program, catalogue year, completed credits), and appointment booking. The prompt names them as such; your tool definitions should match, and catalogue lookup should be scoped per catalogue year since requirements change between years.
5. Test before deployment: a routine prerequisite question (should answer directly and cite the catalogue section, no tool call needed beyond lookup), a full degree-plan request with completed credits supplied (should return the term-by-term table capped at {{MAX_CREDITS_PER_TERM}} credits per term with no dependency violations), and a message containing wellbeing or financial language (must refer to {{WELLBEING_CONTACT}} or {{FINANCIAL_AID_CONTACT}} and stop short of advising on the matter itself).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Catalogue / requirements lookup | Requirement answers, degree audit, planning | Yes |
| Student record lookup (program, catalogue year, credits) | Term planning, degree audit | No |
| Appointment booking | Escalation and handoff | Yes |
