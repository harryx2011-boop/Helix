---
config_keys:
  COMPANY_NAME: "Acme Corp"
  LEGAL_EMAIL: "legal@example.com"
  ESCALATION_THRESHOLD: "$50,000"
  APPROVED_VENDOR_LIST: "https://docs.example.com/vendors"
  DOCUMENT_REPOSITORY: "https://docs.example.com/legal"
  MAXIMUM_LEGAL_REVIEW_DURATION: "3"
  DATA_TEAM_EMAIL: "data-team@example.com"
  HOLD_TICKET_SYSTEM: "https://tickets.example.com/legal-holds"
  HOLD_DURATION_DEFAULT: "365"
  CUSTODIAN_LIST_URL: "https://docs.example.com/custodians"
  ESCALATION_CONTACT: "General Counsel"
  COMPANY_STANDARD_NDA: "https://docs.example.com/legal/standard-nda"
  UNACCEPTABLE_TERMS: "Unlimited liability, perpetual confidentiality, unilateral IP assignment"
  REVIEW_TURNAROUND: "4"
  AUTOMATED_SIGN_THRESHOLD: "Standard mutual NDA with zero modifications"
  JURISDICTION_LIST: "US, EU, UK"
  PRIVACY_POLICY_URL: "https://example.com/privacy"
  DATA_PROCESSING_AGREEMENT_URL: "https://docs.example.com/legal/dpa-template"
  COMPLIANCE_WIKI: "https://docs.example.com/compliance"
  ESCALATION_TRIGGER: "Any material gap or new jurisdiction"
---
## Deploying in your legal workflow

This role covers four personas, none of which are lawyers and none of which give legal advice: the default Contract Review Agent, the Litigation Hold Coordinator, the NDA First-Pass Reviewer, and the Privacy Policy Reviewer. All four share this platform guide but serve different intake channels.

1. Fill the configuration keys above; the wizard substitutes them into each persona's prompt automatically. Compile each persona separately, since they are deployed at different intake points (contract review, a litigation-hold mailbox, an NDA fast-track queue, a policy-audit tool).

2. Paste the compiled prompt into the system field of your legal assistant tool (document review platform, email AI, internal chat). For the Litigation Hold Coordinator, ensure the deployment can send email directly to {{DATA_TEAM_EMAIL}} and named custodians from {{CUSTODIAN_LIST_URL}}, not just draft text for a human to copy.

3. Provide context as documents: upload contracts, NDAs, or hold notices as PDFs or paste full text. For policies and templates, link to {{DOCUMENT_REPOSITORY}} or {{COMPANY_STANDARD_NDA}} rather than pasting the text fresh each time.

4. Route escalations to {{LEGAL_EMAIL}} with the agent's risk summary and the full document attached. Route hold disputes and hold releases to {{ESCALATION_CONTACT}} instead, since those require a different authority than a standard contract escalation.

5. Test with three documents per persona at minimum: for the default agent, a simple NDA below {{ESCALATION_THRESHOLD}}, a contract with a red-zone clause, and a deal above threshold; for the NDA reviewer, a standard NDA (auto-approve), one with a term from {{UNACCEPTABLE_TERMS}} (escalate), and an ambiguous clause (escalate). Every persona must also be tested with a direct request for a legal opinion, which it must decline and route to {{LEGAL_EMAIL}}.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Document retrieval ({{DOCUMENT_REPOSITORY}}) | Contract review, policy lookup | Yes |
| Email / escalation | Risk summary handoff | Yes |
| Custodian list ({{CUSTODIAN_LIST_URL}}) and hold tracker ({{HOLD_TICKET_SYSTEM}}) | Litigation hold coordination | No (Litigation Hold only) |
| Standard NDA template ({{COMPANY_STANDARD_NDA}}) | NDA deviation analysis | No (NDA reviewer only) |
| Compliance wiki ({{COMPLIANCE_WIKI}}) | Privacy policy audit | No (Privacy Policy reviewer only) |
