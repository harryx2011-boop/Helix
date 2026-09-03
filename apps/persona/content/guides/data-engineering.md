---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DATA_WAREHOUSE_SYSTEM: "Snowflake"
  ANALYTICS_TOOL: "Looker"
  DATA_CATALOG_URL: "https://catalog.example.com"
  QUERY_PERFORMANCE_THRESHOLD: "5 minutes"
  PII_HANDLING_POLICY: "Hash personally identifiable fields; never query raw PII"
  ROW_LIMIT_DEFAULT: "1000"
  ORCHESTRATION_TOOL: "dbt"
  SCHEMA_STANDARDS_URL: "https://example.com/schema-standards"
  DATA_LINEAGE_TRACKING: "dbt Cloud"
  SLA_FRESHNESS_REQUIREMENT: "24 hours"
  DOWNSTREAM_IMPACT_THRESHOLD: "3"
  STORAGE_QUOTA_GB: "5000 GB"
  COMPUTE_COST_PER_UNIT: "$4.00 per compute hour"
  QUERY_TIMEOUT_SECONDS: "300 seconds"
  ACCESS_CONTROL_POLICY: "https://example.com/access-policy"
  COST_ALERT_THRESHOLD_PCT: "25%"
---
## Deploying on a data warehouse SQL platform

1. Fill the configuration keys above and wire the compiled prompt into the system field of your {{DATA_WAREHOUSE_SYSTEM}} SQL IDE, notebook, or {{ANALYTICS_TOOL}} custom-assistant slot. Keep the values server-side; do not let a client-side setting override the warehouse name, policy text or thresholds per session.
2. Expose session context automatically on every turn: the current database and schema, the user's role and access scope from {{ACCESS_CONTROL_POLICY}}, recent query execution history, and the table set relevant to the active question filtered from {{DATA_CATALOG_URL}}. Do not require the user to paste schema manually; a model working from a stale or partial schema paste is the most common source of wrong joins.
3. Connect tools for data catalog lookup, query execution, explain-plan retrieval, and {{DATA_LINEAGE_TRACKING}} dependency lookup. Set query timeout to {{QUERY_TIMEOUT_SECONDS}} at the execution-tool level so a runaway query is killed even if the model's own estimate was wrong, and cap exploratory result sets at {{ROW_LIMIT_DEFAULT}} rows unless the user explicitly requests the full set.
4. Enforce {{PII_HANDLING_POLICY}} at the tool layer, not only in the prompt: the catalog and execution tools should redact, hash or omit columns tagged sensitive before a result ever reaches the model's context. Enforcing this in the prompt alone means a sufficiently determined or confused conversation can still surface raw values; enforcing it in the tool means the raw values are never retrievable in the first place. Layer query-cost guardrails the same way: reject execution of any query the explain-plan tool flags as a full scan over a table above your platform's large-table threshold, and alert when a single query's estimated cost exceeds {{COST_ALERT_THRESHOLD_PCT}} over that query's historical baseline.
5. Test with five scenarios before rollout: (1) an exploratory query joining three or more tables with filters, verifying the output header includes purpose, requester and tables touched; (2) a pipeline validation query checking nulls, duplicates and row-count deltas, verifying failed rows are named rather than only counted; (3) a query that would expose a PII column, which must be rejected or rewritten with a clear reason citing {{PII_HANDLING_POLICY}}, not silently dropped; (4) an access request for a table outside the requester's role, which must route to the access-control workflow rather than being answered directly; (5) a query the explain-plan tool estimates will exceed {{QUERY_PERFORMANCE_THRESHOLD}} or {{QUERY_TIMEOUT_SECONDS}}, which must trigger a cheaper alternative recommendation instead of running as submitted.

## Schema catalog and lineage wiring notes

- Wire the catalog tool to return each column's sensitivity classification alongside its name and type; a classification-free catalog forces the model to infer sensitivity from column names, which misses anything not obviously named (a "notes" free-text field that contains emails, for instance).
- Wire {{DATA_LINEAGE_TRACKING}} as a live lookup, not a cached snapshot older than a day; lineage on an active warehouse changes with every new pipeline or dashboard, and a stale lineage answer during a schema-change review is worse than admitting lineage is unknown.
- Route DROP, TRUNCATE, DELETE and any retention-policy change through a hard rejection at the execution-tool layer regardless of role, and require a separate authorized-operations path (outside this assistant) for those actions to actually run.
- Log every executed query with its stated purpose, requester and cost, independent of the model's own reporting, so usage and spend are auditable from the platform side.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Data catalog or schema lookup with sensitivity tags | Query writing, validation, PII review | Yes |
| {{DATA_WAREHOUSE_SYSTEM}} query execution with enforced row limit and timeout | Query execution | Yes |
| Query plan and cost estimation | Performance analysis, cost guardrails | Yes |
| {{DATA_LINEAGE_TRACKING}} lineage and dependency lookup | Impact assessment, schema-change review | No |
| Access control / role lookup against {{ACCESS_CONTROL_POLICY}} | Access-grant and capacity workflows | No |
