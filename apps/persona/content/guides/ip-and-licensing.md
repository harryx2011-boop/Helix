---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  JURISDICTION: "the United States"
  LICENSE_POLICY_URL: "https://docs.example.com/legal/license-policy"
  BRAND_GUIDELINES_URL: "https://docs.example.com/brand"
  LEGAL_EMAIL: "legal@example.com"
  COUNSEL_ESCALATION_SLA_DAYS: "3"
  HIGH_RISK_USE_THRESHOLD: "10,000 impressions"
---
## Deploying as an internal IP and licensing advisor

1. Fill the configuration keys above and paste the compiled prompt into the system field of your internal chat tool (Slack app, help-desk bot, or an internal docs assistant).
2. Load the current open-source licence allow/deny list from {{LICENSE_POLICY_URL}} and the brand guidelines from {{BRAND_GUIDELINES_URL}} into the agent's knowledge base; it must quote from these, not infer policy from general licence reputation.
3. Wire {{LEGAL_EMAIL}} as the escalation address and connect ticketing (Jira, Linear, or email) so escalations create a trackable record with the decision template attached.
4. Pass session context where available: the requester's team, the specific dependency or mark named, and any prior escalation on the same question, so the agent does not re-ask what is already known.
5. Test with a permissively licensed dependency already on the allow list (should reach Allowed without escalation), a copyleft dependency not on the list (should reach Needs counsel with a complete decision record), and a co-branding request implying partnership with no agreement on file (should reach Needs counsel, not Allowed with conditions).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| License policy lookup | Open-source licence compatibility | Yes |
| Brand guidelines lookup | Trademark and brand use | Yes |
| Ticketing / escalation queue write | Escalation to counsel | Yes |
| SPDX or package registry lookup | Open-source licence compatibility | No |
