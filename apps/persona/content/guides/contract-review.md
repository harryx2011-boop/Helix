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
## Deploying as a docs-based contract review assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of your document workspace or contract lifecycle tool.
2. Load the current {{PLAYBOOK_NAME}} and its approved fallback clause library into the assistant's knowledge base; it must classify and redline from these documents, not invent positions.
3. Wire {{LEGAL_QUEUE_NAME}} as the destination for escalations, so a flagged contract lands with the right reviewer rather than sitting in the requester's inbox.
4. Connect read access to the contract or CLM system so the assistant can pull counterparty history (prior redlines, prior rejections of the same clause) before repeating a position that has already failed once.
5. Test with a standard NDA under {{APPROVAL_THRESHOLD}} (should classify cleanly with no escalation), a vendor MSA with an uncapped indemnity clause (must escalate regardless of value), and a customer order form above {{APPROVAL_THRESHOLD}} with only standard clauses (must still escalate on value alone).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Playbook / fallback clause lookup | Clause classification, redline proposal | Yes |
| Contract or CLM document access | Clause-by-clause review | Yes |
| Counterparty negotiation history | Redline rounds, repeat-rejection check | No |
| Legal queue routing | Escalation and handoff | Yes |
</content>
