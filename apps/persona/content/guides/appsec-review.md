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
  DESIGN_DOC_REPOSITORY_URL: "https://docs.example.com/design"
  HIGH_RISK_APPROVAL_REQUIRED: "High"
  UPGRADE_SLA_DAYS: "7"
  BREAKING_CHANGE_APPROVAL_REQUIRED: "major"
---
## Deploying as a code review bot

This role covers three personas: the default reviewer, the Threat Modeler, and the Dependency Auditor. They share this platform guide; compile and wire each separately if you deploy more than one.

1. Fill the configuration keys above and paste the compiled prompt into the system field of your code review bot, PR integration, or a bot account with review-comment access. Confirm the bot's token has read access to diffs and lockfiles and write access to post comments, but not merge or admin rights.
2. Load {{SECURITY_STANDARDS_URL}} into the knowledge base so findings cite your team's actual rules by name. For the Threat Modeler, also load {{DESIGN_DOC_REPOSITORY_URL}} so sessions can reference existing designs instead of starting from nothing.
3. Wire {{REPOSITORY_URL}} diff and lockfile access as tool calls, plus a live lookup against {{VULNERABILITY_DB_TOOL_NAME}} for the default persona and the Dependency Auditor. Do not paste advisory data as static context — advisories change and a stale CVSS score misleads the priority call.
4. Gate merge on {{CRITICAL_BLOCK_SEVERITY}}-severity findings and on any dependency finding at or above {{CVSS_ESCALATION_THRESHOLD}} CVSS as required status checks, not advisory comments a human can dismiss unread. Route anything that meets an escalation trigger to {{SECURITY_CONTACT}} directly rather than waiting for a human to notice it in a comment thread.
5. Test with three cases before enabling as a required check: a diff containing a SQL string built by concatenation (expect a Critical injection finding with the parameterized-query fix), a lockfile bump introducing a package with a known CVE below {{CVSS_ESCALATION_THRESHOLD}} (expect a reachability check before priority is assigned, not an automatic block), and a diff with a hardcoded API key in a config file (expect the key masked in the response and a {{SECRET_ROTATION_SLA_HOURS}}-hour rotation demand).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Diff / lockfile fetch (with context lines) | Every review workflow | Yes |
| Dependency advisory lookup ({{VULNERABILITY_DB_TOOL_NAME}}) | Dependency review, upgrade triage | Yes |
| Security standards lookup ({{SECURITY_STANDARDS_URL}}) | Vulnerability and design review | Yes |
| Codebase search / call-site lookup | Reachability determination | Yes (Dependency Auditor) |
| Design document repository ({{DESIGN_DOC_REPOSITORY_URL}}) | Threat-model scoping | No (Threat Modeler only) |
