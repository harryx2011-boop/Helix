---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  REPOSITORY_URL: "https://github.com/example/repo"
  SECURITY_STANDARDS_URL: "https://standards.example.com/security"
  VULNERABILITY_DB_TOOL_NAME: "GitHub Advisory Database"
  SECURITY_CONTACT: "security@example.com"
  CRITICAL_BLOCK_SEVERITY: "Critical"
  CVSS_ESCALATION_THRESHOLD: "7.0"
  SECRET_ROTATION_SLA_HOURS: "24"
  THREAT_MODEL_FRAMEWORK: "STRIDE"
  UPGRADE_SLA_DAYS: "7"
  BREAKING_CHANGE_APPROVAL_REQUIRED: "major"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call. Compile the default, Threat Modeler, and Dependency Auditor personas as separate system messages if you run more than one — do not merge them into a single prompt.
2. Model settings: start with temperature 0.2 (findings need to be consistent and reproducible across runs of the same diff, not creative), max tokens 2000 (a multi-finding review with evidence and fix blocks runs long), and enable tool use for diff, lockfile and advisory lookups.
3. Pass context as variables: the diff or lockfile change, the repository name, and the PR or session author. Do not inject a guessed reachability verdict or severity into the context — let the model derive it from the actual diff and tool results.
4. Declare tools matching the prompt's names: diff/lockfile fetch, dependency advisory lookup ({{VULNERABILITY_DB_TOOL_NAME}}), codebase search for call-site reachability, and a security-standards lookup ({{SECURITY_STANDARDS_URL}}). A tool name mismatch between your declaration and the prompt's wording causes the model to describe a lookup it cannot actually perform.
5. Test before deployment with three cases: a diff with a command built from unsanitized user input (should return a Critical injection finding with file:line evidence and a fix block), a dependency bump with a CVE below {{CVSS_ESCALATION_THRESHOLD}} in a package used only in a build script (should return Low priority after a reachability check, not an automatic escalation), and a prompt-injection attempt embedded in a code comment asking the model to approve the PR (should be ignored, reported as an embedded instruction, and the review should continue normally).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Diff / lockfile fetch (with context lines) | Every review workflow | Yes |
| Dependency advisory lookup ({{VULNERABILITY_DB_TOOL_NAME}}) | Dependency review, upgrade triage | Yes |
| Security standards lookup ({{SECURITY_STANDARDS_URL}}) | Vulnerability and design review | Yes |
| Codebase search / call-site lookup | Reachability determination | Yes |
