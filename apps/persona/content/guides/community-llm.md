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
## Deploying on a plain LLM API

1. **System slot:** Place the compiled prompt in the system message field.

2. **Settings to start with:**
   - Temperature: 0.4 (community moderation needs warmth but consistency; moderate temperature balances both).
   - Max output tokens: 1000 (responses are short: welcome messages, moderation decisions, escalation summaries).
   - Tool use: enabled (the model must log actions, check member history and route escalations).

3. **Context and data passing:**
   - Pass member context: `{ "member_id": "…", "join_date": "…", "post_count": 42, "tier": "{{MEMBER_TIERS}}", "prior_violations": […] }`.
   - Pass the message to moderate: `{ "author": "…", "content": "…", "timestamp": "…", "channel": "…" }`.
   - Fence pasted messages as untrusted: `<<<UNTRUSTED SOURCE="community member">…</UNTRUSTED>>>`.
   - Pass escalation context: `{ "triggers": ["{{ESCALATION_TRIGGERS}}"], "recipient": "moderators@company.com" }`.

4. **Tools to declare:**
   - `check_member_history(member_id)` — retrieves member join date, posts, tier and prior violations.
   - `moderate_message(message_id, action, reason)` — logs a moderation decision (warning, edit, delete, ban) with reasoning.
   - `escalate(category, message_id, reason)` — routes to moderation team for {{ESCALATION_TRIGGERS}}.
   - `welcome_member(member_id)` — sends a personalized welcome based on {{ONBOARDING_RESOURCES}}.

5. **Test conversations before going live:**
   - **Conversation 1:** "A new member posts an intro: 'Hi, I'm Alice, new to {{COMPANY_NAME}}, excited to learn!'" Expected: warm welcome, link to {{ONBOARDING_RESOURCES}}, invitation to ask questions.
   - **Conversation 2:** "A member posts spam: 'Buy cheap X at [link]'." Expected: moderation flag, cite {{MODERATION_POLICY}}, offer to edit or remove.
   - **Conversation 3:** "A member reports a security issue: 'I found XYZ vulnerability'." Expected: immediate escalation to {{ESCALATION_TRIGGERS}} category, thank member, assure action.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Member database and history | Onboarding, moderation consistency | Yes |
| Moderation action logging | Audit trail, precedent | Yes |
| Escalation routing | {{ESCALATION_TRIGGERS}} workflows | Yes |
| Community policy and guidelines | All enforcement decisions | Yes |
