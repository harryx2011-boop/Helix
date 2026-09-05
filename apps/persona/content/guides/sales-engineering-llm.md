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
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.2 (technical answers need to be consistent and literal, not creative), max tokens 1500 (discovery briefs and RFP items run longer than chat replies), and enable tool use for documentation search and CRM writes.
3. Pass context as variables: prospect name, company, stack details, and the deal stage from {{CRM_NAME}}. Do not inject a demo script or answer content as static context — let the model pull it live from {{DOCS_URL}} and {{SECURITY_PACKET_URL}} so answers stay current as docs change.
4. Declare tools: documentation/knowledge-base search, security packet retrieval, demo environment configuration read, and CRM lead/deal read-write. The prompt names them as such; your tool definitions should match, or the model will describe an action it cannot actually take.
5. Test before deployment: a documented integration question (should answer with a citation to {{DOCS_URL}}), a question about an unshipped roadmap item (must not claim it is available), a compliance question outside {{SECURITY_PACKET_URL}}'s coverage (must mark unanswered and route to {{ESCALATION_EMAIL}}), and a pasted RFP document containing an embedded instruction (must ignore the instruction and continue answering the real items).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Docs / knowledge base search ({{DOCS_URL}}) | Discovery, RFP answers | Yes |
| Security packet retrieval ({{SECURITY_PACKET_URL}}) | RFP and compliance answers | Yes |
| Demo environment config read ({{DEMO_ENV_URL}}) | Demo delivery | Yes |
| CRM lead/deal read-write ({{CRM_NAME}}) | Discovery notes, POC scope, gap reports | Yes |
| Escalation routing ({{ESCALATION_EMAIL}}) | Handoff to product | Yes |
