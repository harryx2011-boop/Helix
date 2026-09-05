---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DOCS_URL: "https://docs.acme.com"
  DEMO_ENV_URL: "https://demo.acme.com"
  SECURITY_PACKET_URL: "https://trust.acme.com"
  CRM_NAME: "Salesforce"
  POC_MAX_DAYS: "30"
  ESCALATION_EMAIL: "product@acme.com"
  UNSUPPORTED_THRESHOLD: "2"
---
## Deploying as a documentation-grounded assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of your docs-embedded assistant (an in-page widget on {{DOCS_URL}}, or a portal tool sales engineers query directly).
2. Load the current architecture docs, API reference, and security/compliance packet from {{DOCS_URL}} and {{SECURITY_PACKET_URL}} into the assistant's knowledge base; it must cite from these, not paraphrase from training data.
3. Wire read access to {{DEMO_ENV_URL}}'s configuration state and write access to {{CRM_NAME}} so discovery notes, POC scope documents, and gap reports land on the deal record without manual re-entry.
4. Connect the escalation path so a flagged gap or unanswered question routes to {{ESCALATION_EMAIL}} automatically, with the originating question and deal name attached.
5. Test with three concrete cases: a documented integration question (should answer and cite the exact doc section), a roadmap feature a prospect assumes already ships (should say it does not exist yet, not describe it as available), and a compliance question outside {{SECURITY_PACKET_URL}}'s coverage (should mark unanswered and route to {{ESCALATION_EMAIL}}).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Docs / knowledge base search ({{DOCS_URL}}) | Discovery, RFP answers | Yes |
| Security packet retrieval ({{SECURITY_PACKET_URL}}) | RFP and compliance answers | Yes |
| Demo environment config read ({{DEMO_ENV_URL}}) | Demo delivery | Yes |
| CRM read/write ({{CRM_NAME}}) | Discovery notes, POC scope, gap reports | Yes |
| Escalation routing ({{ESCALATION_EMAIL}}) | Handoff to product | Yes |
