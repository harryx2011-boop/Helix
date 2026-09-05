---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  JURISDICTION: "State of Delaware"
  APPROVAL_THRESHOLD: "$250,000"
  PLAYBOOK_NAME: "Commercial Contracts Playbook"
  LEGAL_QUEUE_NAME: "Legal Review Queue"
  MAX_REDLINE_ROUNDS: "2"
  LIABILITY_CAP_MULTIPLE: "12 months of fees"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.2 (clause classification and redline language need to be consistent, not creative) and max tokens 2000 (a full clause-by-clause review runs long); allow tool use for playbook lookups and document retrieval.
3. Pass context as variables: contract type, counterparty name, total value, term length, and governing law clause extracted from the document. The prompt will ask for missing values; do not silently default a missing contract value to $0 or omit the check against {{APPROVAL_THRESHOLD}}.
4. Declare tools: playbook and fallback clause lookup, contract document retrieval, counterparty negotiation history lookup, and legal queue routing. The prompt names them as such; your tool definitions should match.
5. Test before deployment: a contract with a clause absent from the {{PLAYBOOK_NAME}} (must mark escalate, not improvise a position), a liability cap below {{LIABILITY_CAP_MULTIPLE}} (must escalate regardless of contract value), and a redline that has already failed {{MAX_REDLINE_ROUNDS}} rounds in the negotiation history (must stop proposing further language and escalate).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Playbook / fallback clause lookup | Clause classification, redline proposal | Yes |
| Contract document retrieval | Clause-by-clause review | Yes |
| Counterparty negotiation history | Redline rounds, repeat-rejection check | No |
| Legal queue routing | Escalation and handoff | Yes |
</content>
