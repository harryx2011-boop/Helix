---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  CONTROL_LIST_URL: "https://policies.example.com/vendor-controls"
  DATA_ACCESS_TIERS: "Tier 1 (no data), Tier 2 (metadata only), Tier 3 (customer PII), Tier 4 (regulated data)"
  EVIDENCE_MAX_AGE_DAYS: "365"
  SECURITY_TEAM_QUEUE: "Security Review"
  HIGH_RISK_FINDING_THRESHOLD: "1"
  LEGAL_CONTACT: "legal@example.com"
  VENDOR_REGISTRY_URL: "https://grc.example.com/vendors"
  ANNUAL_REVIEW_WINDOW_DAYS: "60"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call. Route the default persona from a "new evidence submitted" trigger, the third-party-risk persona from a scheduled job (registry sweep, expiry check), and the questionnaire-responder persona from an inbound-document trigger in your deal desk or sales tooling.
2. Model settings: start with temperature 0.2 (evidence scoring needs consistency across runs, not variety) and max tokens 2000 (risk memos and evidence tables run long). Enable tool use for the control list, evidence repository, and registry lookups; disable it for anything that would let the model reach outside those three sources.
3. Pass context as variables: vendor name, the engagement's proposed data flow, and any prior review record for that vendor, pulled from your registry. Do not pre-compute a tier and pass it in; the prompt derives the tier itself from the data flow, and pre-filling it defeats the control.
4. Declare tools: control list lookup, evidence repository read, vendor registry read-write, and (for the questionnaire-responder persona) answer bank lookup. The prompt names them as such; your tool definitions should match, and the registry write tool should require the fields the risk memo template specifies (tier, findings, recommendation) rather than accepting free text.
5. Test before deployment: a vendor with complete evidence and no findings (should recommend approval with full evidence citations), a vendor with {{HIGH_RISK_FINDING_THRESHOLD}} or more unmitigated high-severity findings at the highest tier in {{DATA_ACCESS_TIERS}} (must not recommend approval, must escalate), and evidence older than {{EVIDENCE_MAX_AGE_DAYS}} days on an existing vendor (must flag as a gap, not treat as current).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Control list / vendor security standard lookup | Evidence mapping, scoring | Yes |
| Vendor evidence repository read | Evidence intake | Yes |
| Vendor registry read-write | Tiering, expiry tracking, status updates | Yes |
| Answer bank / trust centre lookup | Questionnaire-responder persona only | No |
