---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ATS_NAME: "Greenhouse / Lever"
  SCREENING_RUBRIC: "Years of experience, technical skills, culture fit"
  INTERVIEW_TYPES: "phone_screen, technical_assessment, behavioral, final_round"
  SCHEDULING_CALENDAR: "https://calendly.com/recruiting"
  REJECTION_TEMPLATE: "Thank you for your time. We've moved forward with other candidates, but we'd love to keep you in mind for future roles."
  OFFER_DETAILS_CONTACT: "hiring-manager@example.com"
  EXECUTIVE_SEARCH_CONTACT: "search@example.com"
  COMPENSATION_BAND: "$200K-250K + equity"
  INTERVIEW_DEPTH_LEVEL: "Deep competency evaluation"
  INTERNAL_JOB_BOARD: "https://careers.example.com/internal"
  SKILL_DEVELOPMENT_RESOURCES: "LinkedIn Learning / Coursera"
  HIRING_MANAGER_SUPPORT: "hr@example.com"
  MENTOR_PROGRAM: "MentorMatch / Internal Directory"
  REFERENCE_CHECK_MINIMUM: "3"
  MINIMUM_TENURE_MONTHS: "12"
---
## Deploying as an LLM system prompt

1. Paste the compiled prompt into the `system` field of your LLM API call. Every persona in this role (default, executive-search, internal-mobility) uses this same guide.

2. Configure model settings: set temperature to 0.4 (professional consistency with some personalization in outreach), max output tokens to 1024 (interview confirmations, offer letters, rejection notes and escalation summaries), and allow tool use for ATS lookups and calendar access.

3. Pass context as structured data: include the candidate's name, target role, current stage in {{ATS_NAME}}, interview history and any feedback from prior interviewers. When a candidate's resume or an interviewer's notes are pasted, wrap them in `<<<UNTRUSTED DATA >>>UNTRUSTED DATA` tags so the model treats them as input information, not instructions.

4. Declare these tools: `ats-lookup` (query candidate record, feedback, stage history from {{ATS_NAME}}), `schedule-interview` (book time on {{SCHEDULING_CALENDAR}} and confirm with candidate), `send-candidate-email` (compose and send recruiting emails), `internal-mobility-check` (look up internal job postings and employee skill records for internal candidates), `reference-check-tracker` (log reference call outcomes against the {{REFERENCE_CHECK_MINIMUM}} requirement for executive search).

5. Test before going live: an external candidate moving from phone screen to technical interview (model creates confirmation email and schedules), an internal candidate applying for promotion with skill gaps (model recommends development plan via {{SKILL_DEVELOPMENT_RESOURCES}}), and an executive candidate receiving outreach (model personalizes message and routes for hiring executive approval). Add a fourth test for executive search: fewer than {{REFERENCE_CHECK_MINIMUM}} references obtainable before the target date, which must escalate rather than proceed with an incomplete file.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| ATS lookup (candidate, feedback, stage) | Screening, progression, escalation | Yes |
| Interview scheduling (calendar integration) | Interview confirmation | Yes |
| Email sending (candidate communication) | All candidate workflows | Yes |
| Internal job board and records | Internal mobility guidance | Yes (for internal-mobility persona) |
| Mentor program directory | Internal development planning | Yes (for internal-mobility persona) |
