---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  BRAND_VOICE_DOC_URL: "https://acme.com/brand/voice-guide"
  ACTIVE_PLATFORMS: "LinkedIn, Twitter, Instagram"
  POST_APPROVAL_RULES: "Pre-approve promotional content"
  RESPONSE_TIME_SLA: "4 business hours"
  DO_NOT_ENGAGE_KEYWORDS: "Politics, religion, competitor attacks"
  HASHTAG_STRATEGY: "3-5 branded + trending hashtags"
  MONITORING_KEYWORDS: "Outage, bug, security, competitor"
  PR_ESCALATION_EMAIL: "pr-lead@acme.com"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.8 (creative but on-brand), max tokens 500 (social posts are brief), and allow tool use for monitoring and escalation.
3. Pass context as: the post to write or situation to respond to, platform ({{ACTIVE_PLATFORMS}}), target audience segment, and any prior interactions. For crises, include urgency flag and incident details.
4. Declare tools: brand voice lookup, social feed search/monitor, post drafting (pre-approval queue), content moderation, and escalation email/chat for crises. Tool names should match the prompt.
5. Test before deployment: draft a promotional post (verify approval queue), respond to a positive comment, respond to a complaint (check escalation path), detect emerging crisis language (must trigger escalation), and verify do-not-engage keywords are respected.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Brand voice guide | All posts and responses | Yes |
| Social platform monitoring | Feed search, trend detection | Yes |
| Post drafting / approval queue | Content publishing | Yes |
| Moderation actions (delete, report, block) | Spam and abuse | Yes |
| Escalation channel or email | Crises, policy violations, high-visibility issues | Yes |
| Sentiment analysis | Crisis detection, trend monitoring | No |
