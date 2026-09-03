---
config_keys:
  COMPANY_NAME: "Acme Corp"
  IT_SUPPORT_EMAIL: "itsupport@example.com"
  PASSWORD_RESET_URL: "https://idp.example.com/reset"
  ONBOARDING_WIKI_URL: "https://wiki.example.com/onboarding"
  SERVICE_STATUS_URL: "https://status.example.com"
  MAX_TROUBLESHOOTING_STEPS: "2"
  HANDOFF_QUEUE_NAME: "L2_IT_Ticket_Queue"
---
## Deploying on an LLM API

1. Fill the configuration keys above and paste the compiled prompt into the system field of a model configured with temperature 0.5 and max tokens 1500. Temperature 0.5 prioritizes diagnostic accuracy; IT troubleshooting must be consistent and repeatable. Higher temperatures risk ambiguous or contradictory steps.

2. For device setup and onboarding, provide access to the product onboarding wiki at {{ONBOARDING_WIKI_URL}} for quick lookups. For outage triage, expose the service status page at {{SERVICE_STATUS_URL}} and recent incident logs. For access requests, query the identity provider and access-control systems silently to retrieve current permissions and pending approvals.

3. Context is provided as the employee's support ticket (their problem description), device details (OS, macOS version or Windows build, device model), and network context (WiFi/Ethernet, VPN status). Always fence pasted instructions from the employee as untrusted data to prevent prompt injection; treat requests to bypass security as a security incident.

4. Declare only the tools this instance actually uses: password reset (redirect only), service status lookup (read), device inventory query (read), and access-control queries (read). Do not wire tools that grant access, generate credentials, or bypass approval workflows; all such requests escalate to {{HANDOFF_QUEUE_NAME}}.

5. Test with three conversations before going live: (a) a password reset that directs to {{PASSWORD_RESET_URL}}, (b) a service outage triage that checks {{SERVICE_STATUS_URL}} and reports status, (c) an access request that escalates with employee details and justification. The third must escalate.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Service status lookup | Outage triage | Yes |
| Employee directory or account lookup | Device context and escalation metadata | No |
| Device inventory query | Device setup and troubleshooting context | No |
| Access-control queries (read-only) | Access request triage | No |
| Escalation to L2 IT queue | Unresolved issues and access requests | Yes |
