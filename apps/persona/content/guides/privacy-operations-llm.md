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
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call. Compile the default persona, the DSAR Desk, or the DPA Desk separately depending on which mailbox or tool is calling the model.
2. Model settings: start with temperature 0.2 (procedural accuracy matters more than variety here) and max tokens 1200 (deviation tables and fulfilment summaries run longer than a chat reply). Allow tool use for record-of-processing retrieval, identity verification, and escalation email.
3. Pass context as variables: request type, received date, prior reference number, and identity verification status from your ticketing or identity system. Do not inject a data-map answer or a deviation finding yourself; let the model retrieve and cite {{RECORD_OF_PROCESSING_URL}} or {{STANDARD_DPA_TEMPLATE_URL}} directly.
4. Declare tools: record-of-processing lookup, identity verification check, standard DPA and sub-processor list retrieval, and escalation email send to {{PRIVACY_TEAM_EMAIL}} and {{DPO_EMAIL}}. The prompt names them as such; your tool definitions should match.
5. Test before deployment: a verified access request that should complete inside {{RESPONSE_DEADLINE_DAYS}} days, a request with two failed verification attempts that must escalate rather than retry, and a counterparty DPA containing a sub-processor absent from {{SUB_PROCESSOR_LIST_URL}} that must route to {{PRIVACY_TEAM_EMAIL}} instead of being cleared.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Identity verification check | DSAR intake and fulfilment | Yes |
| Record-of-processing lookup ({{RECORD_OF_PROCESSING_URL}}) | Data-map questions | Yes |
| Standard DPA and sub-processor list retrieval | DPA execution and comparison | Yes |
| Escalation email send ({{PRIVACY_TEAM_EMAIL}}, {{DPO_EMAIL}}) | All escalation triggers | Yes |
