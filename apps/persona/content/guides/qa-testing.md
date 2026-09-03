---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ISSUE_TRACKER_URL: "https://tracker.example.com"
  TEST_FRAMEWORK: "Jest / pytest"
  REGRESSION_TEST_DAYS: "30"
  COVERAGE_REPORT_URL: "https://coverage.example.com"
  STAGING_ENV_URL: "https://staging.example.com"
  MAX_REPRO_ATTEMPTS: "3"
  SEVERITY_AUTO_ESCALATE: "Critical"
  PERFORMANCE_BASELINE_URL: "https://metrics.example.com"
  LATENCY_P95_TARGET_MS: "300"
  REGRESSION_THRESHOLD_PERCENT: "10"
  COST_APPROVAL_THRESHOLD: "$1,000.00"
  SECURITY_STANDARDS: "OWASP Top 10"
  THREAT_MODEL_URL: "https://docs.example.com/threat-model"
  CVSS_AUTO_ESCALATE: "7.0"
  COMPLIANCE_FRAMEWORK: "SOC 2"
---
## Deploying QA test plan generation

1. Fill the configuration keys above for the persona you are deploying, then paste the compiled prompt into the system field of your QA assistant. The default persona is general test planning and bug triage; swap in the performance or security variant's keys if you deploy those instead of, or alongside, the default.
2. Load the product's feature documentation, user flows, endpoint or schema specs, and known limitations into the knowledge base so test plans match real product behavior instead of assumed behavior. Refresh this on every release cut, not just at initial setup; a stale spec produces test plans for a feature that no longer exists.
3. Connect a test coverage report tool at `COVERAGE_REPORT_URL` (Codecov, Coveralls, or an internal dashboard) and an issue tracker at `ISSUE_TRACKER_URL` (GitHub Issues, Jira, Linear). The agent needs read access to both to avoid writing tests for already-covered cases and to reference historical defects within the `REGRESSION_TEST_DAYS` lookback window. For the performance persona, also wire `PERFORMANCE_BASELINE_URL` (Datadog, New Relic, or an internal metrics store); for the security persona, wire `THREAT_MODEL_URL` and, if your security findings live in a separate tracker from public issues, point `ISSUE_TRACKER_URL` at that restricted tracker instead.
4. Set severity-based routing so the agent's output drives real workflow, not just conversation text: any finding at or above `SEVERITY_AUTO_ESCALATE` (default), a regression beyond `REGRESSION_THRESHOLD_PERCENT` breaching `LATENCY_P95_TARGET_MS` (performance), or a CVSS score at or above `CVSS_AUTO_ESCALATE` (security) should open a ticket in a human-reviewed queue automatically rather than waiting for someone to read the chat transcript. The agent drafts test plans and defect reports but never files directly to production-facing trackers without a human approving the ticket first; critical, security, and compliance findings always bypass automation and go straight to an engineer or the security team.
5. Enforce synthetic-data-only for every environment this agent touches. All reproduction, load testing, and penetration test proof-of-concepts run against `STAGING_ENV_URL`, never production. Reject fixtures or payloads containing real customer data, live credentials, or production identifiers before they reach a committed test file, a ticket, or a shared report; this is a hard gate, not a prompt instruction the model can be trusted to self-enforce alone.
6. Test with five scenarios before rollout: a full-feature test plan referencing real coverage data, a regression test request against a specific bug ID producing runnable `TEST_FRAMEWORK` code, a vague bug report that should trigger a clarifying question instead of a guess, a load test plan for an undocumented endpoint that should ask for the SLA rather than inventing one, and a security test checklist for an auth endpoint that must name CVSS severity and correctly trigger escalation at the `CVSS_AUTO_ESCALATE` threshold.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Feature documentation lookup | Test plan generation, edge-case identification | Yes |
| Coverage report lookup (`COVERAGE_REPORT_URL`) | Regression test planning, coverage-gap prioritization | Yes |
| Issue tracker query (`ISSUE_TRACKER_URL`) | Historical defect reference, duplicate detection | Yes |
| Performance baseline query (`PERFORMANCE_BASELINE_URL`) | Load test planning, regression detection, cost ranking | Only for performance persona |
| Threat model query (`THREAT_MODEL_URL`) | Threat modeling, vulnerability triage, pen test scoping | Only for security persona |

## Notes on multi-persona deployment

Running the default, performance, and security personas side by side is common: route incoming requests to the right one by keyword or ticket label rather than asking one prompt to cover all three. Keep `STAGING_ENV_URL` identical across personas so reproduction, load tests, and penetration proof-of-concepts all target the same known-safe environment.
