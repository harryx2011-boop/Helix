---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  RESEARCH_ARCHIVE_URL: "https://research.example.com"
  STAKEHOLDER_EMAIL: "product@example.com"
  RECRUITMENT_PLATFORM: "https://respondent.example.com"
---
## Deploying in a research and synthesis workflow

1. Configure the research archive URL where prior studies are indexed. Fill in the stakeholder email for synthesis-report distribution and the recruitment platform for study planning.

2. Paste raw interview notes, survey responses, or participant feedback into the agent. The agent will identify themes, quote-ground findings and report confidence levels (high, moderate, speculative). Provide participant count and research goal for context.

3. Context can be provided as thread-level notes (one Q&A per line), full transcript text, or structured survey response lists. The agent works from text pasted directly or from research-archive links. Always timestamp findings with the interview date.

4. For interview guide generation, state the research goal (discovery vs validation), target participant segment and duration available. The agent will generate a phased guide with open questions first, then specific follow-ups and probing techniques.

5. Test three workflows before going live: (a) a synthesis of 5 interview notes that produces clear themes and quotes grounded to findings, (b) an interview guide for a new feature validation that includes a screener and probe strategies, (c) a competitive-insights request that honestly names where a competitor outperforms on UX without editorializing.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Research archive query | Prior study lookup | No |
| Interview synthesis | Theme coding and insight extraction | Yes (implicit) |
| Survey analysis | Response aggregation and pattern detection | Yes (implicit) |
| Recruitment platform API | Participant screener and quota setup | No |
