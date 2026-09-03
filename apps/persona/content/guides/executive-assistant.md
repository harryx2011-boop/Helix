---
config_keys:
  EXECUTIVE_NAME: "CEO"
  COMPANY_NAME: "Acme SaaS"
  CALENDAR_TOOL: "Google Calendar"
  MEETING_PREP_DEPTH: "5-minute brief"
  DECISION_ESCALATION_THRESHOLD: "Budget >$100k"
  INBOX_TRIAGE_RULES: "Red flag = same day, yellow = next day"
  EXECUTIVE_PRIORITIES: "Product launch, revenue growth, team retention"
  HANDOFF_QUEUE_NAME: "Chief of Staff"
  HIGH_STAKES_MEETINGS: "Board calls, investor pitches, customer renewals"
  STAKEHOLDER_DATABASE: "Internal stakeholder wiki"
  ALIGNMENT_CADENCE: "Before all meetings with external stakeholders"
  BRIEF_LEAD_TIME: "48 hours"
  DECISION_AUTHORITY_LIMITS: "Budget <$100k, headcount <5"
  DAILY_VOLUME: "50-100 emails"
  URGENT_TRIAGE_RULES: "Customer escalation, compliance issue, P0 bug, executive request"
  ROUTINE_TRIAGE_RULES: "FYI updates, scheduling, expenses <$5k"
  MAX_DAILY_DECISIONS: "3-5 items"
  RED_FLAG_VOLUME_ALERT: "10"
---
## Deploying in an email or chat system

1. Fill the configuration keys above for the persona you're deploying (the default all-round assistant, the meeting specialist, or the triage expert) and substitute them into the compiled prompt.
2. Paste the compiled prompt into the system field of your email client's AI assistant, or your chat platform's custom-agent configuration.
3. Connect {{EXECUTIVE_NAME}}'s live context: read access to {{CALENDAR_TOOL}} for the next 7 days, the last 20-50 inbound messages for triage calibration, and {{EXECUTIVE_PRIORITIES}} so urgency judgments reflect what actually matters this quarter.
4. Wire the routing destinations: red-flag items surface immediately, yellow items batch into a daily summary, green items route to {{HANDOFF_QUEUE_NAME}} with a warm handoff note. Confirm the receiving team can act without looping back.
5. Test with three scenarios before going live: (1) an urgent decision request from a board member, which must surface immediately as red; (2) a routine scheduling message, which should route to {{HANDOFF_QUEUE_NAME}} without escalation; (3) a request at or above {{DECISION_ESCALATION_THRESHOLD}}, which must produce a decision escalation memo, not a routine reply.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Calendar read/write access | Meeting prep, conflict detection | Yes |
| Email or message triage and routing | Inbox management, escalation | Yes |
| Meeting context fetch (attendees, agenda) | Briefing notes, deep briefs | No |
| Stakeholder database or CRM lookup | Meeting-specialist stakeholder mapping | No |
