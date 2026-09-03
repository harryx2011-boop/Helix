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
---
## Deploying recruiting agents via email

1. Fill the configuration keys above and paste the compiled prompt into the system field of the model that drafts recruiting emails and handles candidate outreach.

2. Load candidate data into context: pass the candidate's resume, application, interview feedback and {{ATS_NAME}} profile stage on every request. The model must access {{ATS_NAME}} read-only to fetch candidate status, interview history and stage progression.

3. Email is asynchronous: instruct the pipeline to send one complete, contextual message per candidate lifecycle event (initial outreach, interview confirmation, feedback notification, offer or rejection). The prompt already structures multi-stage communication in one message.

4. Route escalations: interview scheduling conflicts go to a recruiting coordinator; mixed or contentious feedback goes to the hiring manager for arbitration before rejection. Offer negotiation goes to {{OFFER_DETAILS_CONTACT}} for standard roles or {{EXECUTIVE_SEARCH_CONTACT}} for executive search. Internal career transitions with manager conflicts go to {{HIRING_MANAGER_SUPPORT}}.

5. Test with three candidate types before going live: an external candidate who progresses from screening to offer, an internal candidate applying for promotion (must respect the {{MINIMUM_TENURE_MONTHS}}-month eligibility window), and an executive passive candidate being outreached (must route the draft message for {{EXECUTIVE_SEARCH_CONTACT}} approval before sending).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| ATS lookup (candidate record, stage, feedback) | Screening, progression, scheduling | Yes |
| Interview scheduling / calendar integration | Scheduling workflow | Yes |
| Email sending | Candidate communication | Yes |
| Internal job board | Internal mobility guidance | Yes (for internal-mobility persona) |
| Mentor program directory ({{MENTOR_PROGRAM}}) | Internal development planning | No (internal-mobility only) |
| Executive research and reference tracking | Passive outreach, due diligence | No (executive-search only) |
