---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  JURISDICTION: "EU/UK GDPR"
  RESPONSE_DEADLINE_DAYS: "30"
  IDENTITY_VERIFICATION_METHOD: "Account login match plus email confirmation"
  RECORD_OF_PROCESSING_URL: "https://docs.example.com/privacy/ropa"
  STANDARD_DPA_TEMPLATE_URL: "https://docs.example.com/privacy/standard-dpa"
  PRIVACY_TEAM_EMAIL: "privacy@example.com"
  DPO_EMAIL: "dpo@example.com"
  EXTENSION_DAYS: "60"
  DSAR_MAILBOX: "privacy-requests@example.com"
  SUB_PROCESSOR_LIST_URL: "https://docs.example.com/privacy/sub-processors"
  LIABILITY_CAP_STANDARD: "12 months of fees paid"
---
## Deploying on email

This role covers three personas that share this platform guide but serve different intake points: the default Privacy Operations Specialist, the DSAR Desk, and the DPA Desk. Compile each one separately for its own mailbox.

1. Fill the configuration keys above and paste the compiled prompt into the system field of the mailbox or ticketing tool that reads {{DSAR_MAILBOX}} for the DSAR Desk, and a separate legal-intake mailbox for the DPA Desk. The default persona can run on either mailbox in a smaller deployment.
2. Load {{RECORD_OF_PROCESSING_URL}} into the agent's knowledge base for data-map questions, and {{STANDARD_DPA_TEMPLATE_URL}} plus {{SUB_PROCESSOR_LIST_URL}} for DPA execution and comparison. The agent must quote from these documents, not reconstruct them from memory.
3. Wire identity verification so the agent can actually check {{IDENTITY_VERIFICATION_METHOD}} against your account or identity system, rather than asking the requester to self-attest. Wire escalation so a message to {{PRIVACY_TEAM_EMAIL}} (and {{DPO_EMAIL}} where the two differ) sends immediately, not as a queued draft.
4. Pass request metadata as context: received date, request type, and any prior reference number, so the deadline calculation against {{RESPONSE_DEADLINE_DAYS}} days is accurate from the first reply.
5. Test with three cases: a straightforward access request that verifies on the first attempt (should reach fulfilment and close inside {{RESPONSE_DEADLINE_DAYS}} days), a request where verification fails twice (must escalate rather than retry indefinitely), and a counterparty DPA with one material deviation such as an unapproved sub-processor (must route to {{PRIVACY_TEAM_EMAIL}} rather than being countersigned). Every persona must also be tested with a third party asking to confirm someone else's data, which must be refused and routed.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Identity verification ({{IDENTITY_VERIFICATION_METHOD}}) | DSAR intake and fulfilment | Yes |
| Record of processing retrieval ({{RECORD_OF_PROCESSING_URL}}) | Data-map questions | Yes |
| Standard DPA template and sub-processor list retrieval | DPA execution and comparison | Yes |
| Email / escalation to {{PRIVACY_TEAM_EMAIL}} and {{DPO_EMAIL}} | All escalation triggers | Yes |
| Request tracker or ticketing system | Deadline logging across all personas | No (helpful for volume, not required for a single-request flow) |
