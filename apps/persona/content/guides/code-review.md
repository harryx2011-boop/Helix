---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  REPOSITORY_URL: "https://github.com/example/repo"
  CODING_STANDARDS_URL: "https://standards.example.com"
  PRIMARY_LANGUAGE: "TypeScript"
  CI_TOOL_NAME: "GitHub Actions"
  MAX_PR_SIZE_LINES: "400"
  REQUIRED_APPROVERS_POLICY_URL: "https://standards.example.com/approvers"
  AUTO_BLOCK_SEVERITY: "Critical"
  TYPICAL_DATASET_SIZE: "10,000 rows"
  LATENCY_BUDGET_MS: "200"
  MAX_BUNDLE_DELTA_KB: "50"
  SECURITY_STANDARDS_URL: "https://standards.example.com/security"
  SECURITY_CONTACT: "security-team@example.com"
  CVSS_BLOCK_THRESHOLD: "7.0"
  COMPLIANCE_FRAMEWORKS: "SOC 2"
  VULNERABILITY_DB_TOOL_NAME: "GitHub Advisory Database"
  SECRET_ROTATION_SLA_HOURS: "24"
---
## Deploying code review analysis

1. Fill every configuration key above and paste the compiled prompt into the system field of your code review bot or platform integration (a GitHub App, a GitLab CI job, or a bot account with PR-comment access). Confirm the bot's token has read access to the diff and write access to post review comments, but not merge or admin rights.
2. Load {{CODING_STANDARDS_URL}} and, for the security-focused persona, {{SECURITY_STANDARDS_URL}} into the knowledge base or a retrieval tool so findings cite your team's actual rules instead of generic best practices; a review that cites a rule you don't enforce erodes trust in every finding after it.
3. Wire repository access as tool calls, not pasted context: diff fetch, file-history/blame, and {{CI_TOOL_NAME}} test-status lookup. For the security-focused and efficiency-focused personas also wire a dependency advisory lookup ({{VULNERABILITY_DB_TOOL_NAME}}) so CVE citations are current rather than trained-in and stale.
4. Set the review to run on every push to an open PR, not only on open, so a force-push that removes a fix does not slip through on a stale approval. Gate merge on the {{AUTO_BLOCK_SEVERITY}} threshold and, separately, on any finding at or above {{CVSS_BLOCK_THRESHOLD}} CVSS: both should be required-status checks, not advisory comments a human can dismiss unread. Route auth, payment and crypto changes to the approvers named in {{REQUIRED_APPROVERS_POLICY_URL}} regardless of the bot's own verdict.
5. Test against five PR types before enabling as a required check: a straightforward feature PR (expect zero or Minor findings, standards cited by name), a performance-sensitive change with a stated dataset size (expect a Big-O comparison and a measured estimate, not a vague "consider optimizing"), a security-adjacent change touching auth or input parsing (expect CWE/CVSS citations and an escalation to {{SECURITY_CONTACT}}), a PR containing a deliberately planted secret in a config file (expect the secret masked to first/last 4 characters and a rotation demand within {{SECRET_ROTATION_SLA_HOURS}} hours), and an oversized PR past {{MAX_PR_SIZE_LINES}} lines (expect a split recommendation ahead of line-by-line findings).

## Diff and CI wiring notes

- Fetch the diff with enough surrounding context (10-20 lines) to evaluate whether a change is correct in context, not just in isolation; a bare unified diff with zero context lines produces findings that miss existing guards a few lines outside the hunk.
- Treat a force-push or rebase on an open PR as a new diff requiring a fresh review pass, not an amendment to the prior one; stale findings referencing removed lines confuse authors more than they help.
- Surface {{CI_TOOL_NAME}} status inline in the review summary even when it is unrelated to the findings; a green review on a red pipeline reads as an endorsement it did not intend.
- For monorepos, scope the coding-standards lookup to the sub-project the diff touches; a single global standard produces false positives when teams have documented, approved local exceptions.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| PR diff / commit fetch (with context lines) | Every review workflow | Yes |
| File history / blame | Architecture and duplication review, regression risk | No |
| Test result / {{CI_TOOL_NAME}} status lookup | Coverage and reliability check, escalation trigger 4 | Yes |
| Coding standards lookup ({{CODING_STANDARDS_URL}}) | Architecture and style validation | Yes |
| Security standards lookup ({{SECURITY_STANDARDS_URL}}) | Security-focused vulnerability and compliance workflows | Only for security-focused persona |
| Dependency advisory lookup ({{VULNERABILITY_DB_TOOL_NAME}}) | Supply-chain and dependency review | Only for security- and efficiency-focused personas
