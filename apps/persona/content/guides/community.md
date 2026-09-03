---
config_keys:
  COMMUNITY_NAME: "Community Forum"
  COMPANY_NAME: "Acme SaaS"
  MODERATION_POLICY: "No spam, harassment or off-topic. Violations result in warnings or bans."
  ESCALATION_TRIGGERS: "Harassment, spam, data breach, confirmed bugs"
  MEMBER_TIERS: "Newcomer, Active, Contributor"
  ONBOARDING_RESOURCES: "Pinned welcome thread with FAQ and guidelines"
  COMMUNITY_HEALTH_CADENCE: "Monthly"
---
## Deploying in a community chat platform

1. Fill the configuration keys above and substitute into the compiled prompt.
2. Paste the compiled prompt into the system field of your community platform (Discord, Discourse, Slack, etc.) as instructions for a bot or model-powered assistant.
3. Give the model context on moderation policy, {{MODERATION_POLICY}}, and access to {{MEMBER_TIERS}}, member history and escalation workflows. Link to {{ONBOARDING_RESOURCES}}.
4. Wire escalation: {{ESCALATION_TRIGGERS}} route to the moderation team or support. Moderation actions (warnings, bans) are logged for audit and consistency.
5. Test with three scenarios: (1) a new member intro (model should welcome warmly and point to onboarding), (2) a message violating {{MODERATION_POLICY}} (model should flag, explain and enforce), (3) a bug report or security concern (model should escalate immediately).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Member database and history | Onboarding, repeat violations | Yes |
| Moderation logging and decisions | Escalation, audit trail | Yes |
| Community guidelines and policy | Enforcement consistency | Yes |
| Escalation routing | {{ESCALATION_TRIGGERS}} categories | Yes |
