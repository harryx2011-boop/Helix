---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DATA_WAREHOUSE: "PostgreSQL / Snowflake"
  METRIC_DICTIONARY_URL: "https://wiki.example.com/metrics"
  ROW_LIMIT_DEFAULT: "1000"
  QUERY_COST_THRESHOLD: "10 GB scanned"
  DATA_FRESHNESS_SLA: "24 hours"
  ANALYTICS_TICKET_QUEUE: "Data Platform queue"
  NRR_TARGET: "110%"
  CHURN_ALERT_THRESHOLD: "3%"
  FORECAST_HORIZON: "Next quarter"
  FINANCE_REVIEW_QUEUE: "FinOps / Finance queue"
  BI_TOOL: "Metabase"
  BRAND_PALETTE_URL: "https://wiki.example.com/brand/colors"
  MAX_CHART_ROWS: "100000"
  DASHBOARD_REVIEW_QUEUE: "Data Platform queue"
---
## Deploying as a SQL assistant

1. **Match the surface to the dialect.** Paste the compiled prompt into the system field of whichever SQL surface your data team queries through (an in-warehouse chat panel, a Slack bot backed by the warehouse, a notebook cell).
   - Confirm the assistant's dialect matches {{DATA_WAREHOUSE}} exactly. A prompt written against Postgres syntax will emit subtly wrong SQL against Snowflake or BigQuery: date-truncation functions, `LIMIT` vs. `TOP`, identifier quoting rules all differ, and that mismatch is the most common cause of a query that looks right but fails at execution.
2. **Keep the schema and metric context fresh.** Load the live schema definitions and the metric dictionary at {{METRIC_DICTIONARY_URL}} into the agent's retrieval or knowledge base before the first real request.
   - Refresh this load at least as often as {{DATA_FRESHNESS_SLA}}. A schema snapshot older than that will drift from the live warehouse and produce queries against renamed or dropped columns.
   - Version the metric dictionary load so a stale cached copy is detectable, not silently served.
3. **Wire live schema reflection, not a static snapshot.** Connect a read-only schema reflection tool (`INFORMATION_SCHEMA` queries or your warehouse's native catalog API) so the agent confirms table and column names against the live catalog before writing a query.
   - Run this tool silently and cache its result for a session; re-running it on every turn adds latency for no benefit once the schema is confirmed for that conversation.
   - Invalidate the cache immediately on a schema-migration event rather than waiting for the session to end.
4. **Scope the credential and cap the blast radius.** Restrict the database credential behind the assistant to a read-only role scoped to non-PII columns and reporting schemas only.
   - Do not grant access to raw customer tables containing unmasked emails, names, or payment detail, even in read-only form.
   - Enforce a server-side row limit ({{ROW_LIMIT_DEFAULT}} for exploratory queries) and a cost guard at {{QUERY_COST_THRESHOLD}} so a poorly scoped `SELECT *` cannot scan a multi-terabyte table on a single request.
   - Reject execution, don't just warn, when a query would exceed the cost guard without explicit confirmation.
5. **Test before rollout, and again after every migration.** Run five representative requests: a reporting query request (must call schema reflection first and use the documented header-comment format), a query-optimization request against a slow existing query (must identify the actual bottleneck, not add an arbitrary index suggestion), a request naming a table not present in the schema (must ask rather than guess), a request that would require unmasked PII or a connection string (must refuse with the specific reason), and a request pasted with an embedded instruction inside a SQL comment (must be flagged and ignored).
   - Re-run this suite after any schema migration and after any persona version bump.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Schema reflection (read-only, live catalog) | Query generation, optimization, data-quality investigation | Yes |
| Metric dictionary lookup | Metric analysis, cohort and growth workflows | Yes |
| Query cost / scan-size estimator | Enforcing {{QUERY_COST_THRESHOLD}} before execution | Recommended |
| Read-only, non-PII-scoped credential | All query execution | Yes |
