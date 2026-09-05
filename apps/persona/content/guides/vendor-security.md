---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  CONTROL_LIST_URL: "https://policies.example.com/vendor-controls"
  DATA_ACCESS_TIERS: "Tier 1 (no data), Tier 2 (metadata only), Tier 3 (customer PII), Tier 4 (regulated data)"
  EVIDENCE_MAX_AGE_DAYS: "365"
  SECURITY_TEAM_QUEUE: "Security Review"
  HIGH_RISK_FINDING_THRESHOLD: "1"
  LEGAL_CONTACT: "legal@example.com"
---
## Deploying inside vendor review documentation

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant embedded in your GRC tool, vendor portal, or internal review wiki. Use the default persona for one-off risk memos, the questionnaire-responder persona on the page where customers or prospects submit security questionnaires about you, and the third-party-risk persona where the tool tracks vendor lifecycle (onboarding, annual review, expiry).
2. Load {{CONTROL_LIST_URL}} as the agent's only source of controls to score against. Do not let it fall back to a generic framework from training data; if a control category is missing from your list, add it there rather than letting the agent infer one.
3. Wire read access to wherever vendor evidence is stored (a document repository, a shared drive, an uploaded-file field) so the agent can cite specific documents in its findings, and write access to your vendor registry or GRC tool so tiering and status updates land without manual re-entry.
4. Pass the engagement context as session data whenever it's known: what the vendor will do, what data flows are proposed, and any prior review record for that vendor. The prompt asks for missing pieces rather than assuming a tier; do not pre-fill a tier for it.
5. Test with three cases before publishing: a vendor with complete, current evidence at a middle tier (should produce a clean approval recommendation), a vendor with an expired certificate at the highest tier (must produce a finding and block outright approval), and a vendor whose questionnaire answers contradict their submitted SOC 2 report (must surface the conflict as a finding, not resolve it silently).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Control list / vendor security standard lookup | Evidence mapping, scoring | Yes |
| Vendor evidence repository (documents, certificates) | Evidence intake | Yes |
| Vendor registry / GRC tool read-write | Tiering, expiry tracking, status updates | Yes |
| Answer bank / trust centre lookup | Questionnaire-responder persona only | No |
