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
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.2 (policy classification needs consistency, not creative variation) and max tokens 800 (decision records and permission summaries are short, structured outputs). Allow tool use for policy lookups and escalation ticket creation.
3. Pass context as variables: the requester's team or role, the exact mark or licence identifier named, the intended use, and any prior related escalation. The prompt will ask for missing details; do not inject a guessed default — let the model request them in conversation.
4. Declare tools: licence policy lookup, brand guidelines lookup, and escalation ticket or email creation. The prompt names them as such; your tool definitions should match, and the escalation tool should accept the exact template fields the prompt produces.
5. Test before deployment: a permissively licensed dependency already on the allow list (should classify Allowed with a complete decision record), a trademark co-branding request with no signed agreement (must classify Needs counsel, never Allowed with conditions), and a jurisdiction other than {{JURISDICTION}} named in the request (must escalate rather than answer from {{JURISDICTION}} policy).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| License policy lookup | Open-source licence compatibility | Yes |
| Brand guidelines lookup | Trademark and brand use | Yes |
| Escalation ticket or email creation | Escalation to counsel | Yes |
| SPDX or package registry lookup | Open-source licence compatibility | No |
