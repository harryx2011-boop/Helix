---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  PM_TOOL_URL: "https://pm.example.com"
  STATUS_REPORT_AUDIENCE: "Leadership"
  STAKEHOLDER_SYNC_CADENCE: "Weekly"
  RISK_ESCALATION_THRESHOLD: "2 weeks delay or $50k impact"
  TIMELINE_SLIP_THRESHOLD: "10%"
  BLOCKER_SLA_HOURS: "24"
  TEMPLATE_STANDARDS: "RACI matrix, risks and dependencies"
  DECISION_MAKER: "Project sponsor"
  AGILE_FRAMEWORK: "Scrum"
  SPRINT_LENGTH: "2 weeks"
  VELOCITY_BASELINE: "40 story points"
  VELOCITY_DROP_THRESHOLD: "60%"
  RETRO_FOCUS_AREAS: "Estimation and testing"
  EXPERIMENT_TRIAL_LENGTH: "2 sprints"
  PEOPLE_MANAGER_CONTACT: "Engineering manager"
  EXECUTIVE_CADENCE: "Weekly"
  ON_TIME_TARGET: "90%"
  BUDGET_VARIANCE_TARGET: "5%"
  ESCALATION_THRESHOLD: "Red status, >5% budget overrun"
  BLOCKER_AGE_LIMIT: "1"
---
## Deploying in a documentation system

1. Fill the configuration keys above for the persona you are deploying. Not every key applies to every persona; the compiled prompt only substitutes the keys that appear in its own body, so leave the rest at their defaults.
2. Paste the compiled prompt into the system field of your chat interface, project management AI assistant or documentation platform.
3. Expose project context to the model as structured data: current sprint or milestone state from {{PM_TOOL_URL}}, timeline and budget status, deliverables due in the next two weeks, and any recent scope or priority changes.
4. Wire handoff paths: status escalations route through {{STAKEHOLDER_SYNC_CADENCE}} syncs to {{STATUS_REPORT_AUDIENCE}} or {{DECISION_MAKER}}; a sprint-focused deployment instead routes morale and process escalations to {{PEOPLE_MANAGER_CONTACT}}. Confirm the right contact is live before launch.
5. Test with two scenarios before going live: a project on schedule (expect a clean snapshot, no escalation) and one past a named threshold, such as {{RISK_ESCALATION_THRESHOLD}} or {{TIMELINE_SLIP_THRESHOLD}} (expect the escalation line to fire automatically).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Project data access | Status reports, snapshots, sprint forecasts | Yes |
| Stakeholder or manager notification | Escalation, decision briefs | Yes |
| Document generation | Status reports, decision briefs, retro summaries | No |
| Milestone and task retrieval | Sprint snapshots, blockers, dependency logs | Yes |
