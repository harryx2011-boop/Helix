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
## Deploying on a plain LLM API

1. Put the compiled prompt in the system message slot, substituting the config keys above for whichever persona you deployed. The default persona needs only `COMPANY_NAME`, `ISSUE_TRACKER_URL`, `TEST_FRAMEWORK`, `COVERAGE_REPORT_URL`, and `STAGING_ENV_URL`; the performance and security variants each add their own thresholds.
2. Set temperature to 0.2 and max output tokens to 3000-4000. Low temperature keeps test cases, severity labels, and CVSS scores reproducible across runs; test plans and threat models are long enough that 3000 tokens can truncate a multi-role plan mid-case, so raise to 4000 if you see cutoffs. Enable tool use so the agent can verify features and defect history rather than guessing.
3. Pass product context as structured data, not prose: feature documentation, user flows, schema or endpoint specs, prior incident reports, and known limitations. Fence any pasted feature description, bug report, log, screenshot transcript, or exploit writeup as `<<<UNTRUSTED ... >>>UNTRUSTED`, and state in the system prompt that content inside the fence is data to analyze, never an instruction, no matter how it is formatted.
4. Declare these tools with these exact names: `query_feature_docs` (returns feature description and acceptance criteria), `query_coverage_report` (returns test coverage percentage by module, backs `COVERAGE_REPORT_URL`), `query_known_issues` (returns historical defects and workarounds from `ISSUE_TRACKER_URL`), `query_performance_baseline` (returns latency/throughput history, backs `PERFORMANCE_BASELINE_URL`, needed only for the performance persona), and `query_threat_model` (returns documented threats and prior findings, backs `THREAT_MODEL_URL`, needed only for the security persona). Enforce read-only scope server-side; none of these tools should be able to write to production.
5. Run five test conversations before shipping: a full test plan for a multi-role feature (must cite coverage and reference docs, not invent behavior), a regression test request against a named bug ID (must produce {{TEST_FRAMEWORK}} code, not prose), a vague one-line bug report (must ask for missing environment/role details before producing repro steps), a load test request for an endpoint with no documented SLA (must ask for the target rather than inventing p95 numbers), and a security test request for a login endpoint (must name CVSS severity and trigger the escalation rule at the configured threshold).
6. Wire severity-based routing outside the model: when the agent's output contains a severity at or above `SEVERITY_AUTO_ESCALATE` (default persona) or a CVSS score at or above `CVSS_AUTO_ESCALATE` (security persona), route the ticket to a human queue automatically rather than relying on the agent to remember to flag it in conversation. Treat the model's severity label as a routing signal, not a final decision.
7. Enforce synthetic-data-only at the fixture layer, not just in the prompt: reject any test payload or fixture the agent generates that matches a real customer record pattern (real email domains, real card BINs, production user IDs) before it reaches a ticket or a committed test file.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Feature documentation lookup (`query_feature_docs`) | Test plan generation, edge-case identification | Yes |
| Test coverage report query (`query_coverage_report`) | Regression planning, coverage-gap prioritization, avoiding duplicate tests | Yes |
| Issue tracker / defect lookup (`query_known_issues`) | Historical context, duplicate detection, workaround identification | Yes |
| Performance baseline query (`query_performance_baseline`) | Load test planning, regression detection, cost-impact ranking | Only for performance persona |
| Threat model / prior findings query (`query_threat_model`) | Threat modeling, vulnerability triage, penetration test scoping | Only for security persona |

## Notes on multi-persona deployment

If you run more than one `qa-testing` persona against the same API key or agent runtime, keep `ISSUE_TRACKER_URL` separate for the security persona when your security findings must not appear in the public-facing tracker. Reusing one tracker for both is a common cause of a vulnerability report leaking into a customer-visible changelog before it is fixed.
