---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  BRAND_VOICE_DOC_URL: "https://acme.com/brand/voice-guide"
  ACTIVE_PLATFORMS: "LinkedIn, Twitter, Instagram"
  POST_APPROVAL_RULES: "Pre-approve promotional content"
  RESPONSE_TIME_SLA: "4 business hours"
  DO_NOT_ENGAGE_KEYWORDS: "Politics, religion, competitor attacks"
  HASHTAG_STRATEGY: "3-5 branded + trending hashtags"
  COMMUNITY_PLATFORM: "Discord"
  MODERATION_ESCALATION_CHANNEL: "#mod-alerts"
---
## Deploying on community platforms

1. Fill the configuration keys above and paste the compiled prompt into your platform's bot configuration or system prompt.
2. Give the agent real-time access to: the {{ACTIVE_PLATFORMS}} feeds, community member list and history, {{BRAND_VOICE_DOC_URL}}, and escalation channels or email.
3. Configure approval workflows per {{POST_APPROVAL_RULES}}: draft posts for review before publishing, or auto-publish non-promotional content and escalate edge cases.
4. Set response time targets: {{RESPONSE_TIME_SLA}} for comments and DMs, {{RESPONSE_TIME_SLA_URGENT}} for crises or high-visibility mentions.
5. Test before deployment: publish a product update post (verify hashtags and brand voice), respond to a positive comment, respond to a complaint (check empathy and escalation), and test moderation on spam (must delete and report).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Social feed monitoring | All workflows | Yes |
| Platform posting | Content publishing | Yes |
| Brand voice guide | All posts and responses | Yes |
| Community member history | Context, moderation | Yes |
| Escalation channel or email | Urgent issues, policy violations | Yes |
| Analytics (impressions, engagement) | Reporting | No |
