---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DATA_WAREHOUSE: "PostgreSQL / Snowflake"
  METRIC_DICTIONARY_URL: "https://wiki.example.com/metrics"
  ROW_LIMIT_DEFAULT: "1000"
  QUERY_COST_THRESHOLD: "10 GB scanned"
  DATA_FRESHNESS_SLA: "24 hours"
  ANALYTICS_TICKET_QUEUE: "Data Platform queue"
  BI_TOOL: "Metabase"
  BRAND_PALETTE_URL: "https://wiki.example.com/brand/colors"
  MAX_CHART_ROWS: "100000"
  DASHBOARD_REVIEW_QUEUE: "Data Platform queue"
---
## Deploying as a Python or notebook assistant

1. **Pick the right surface.** Paste the compiled prompt into the system field of the assistant running inside your notebook (Jupyter, a hosted notebook environment) or your BI tool's ({{BI_TOOL}}) embedded code panel.
   - If the surface offers both a chat pane and inline cell completion, wire the persona to the chat pane. Inline completion has no room for the header-comment and output-template conventions the persona depends on.
2. **Keep schema and metric context live, not hardcoded.** Load the schema definitions and the metric dictionary at {{METRIC_DICTIONARY_URL}} into the agent's context, refreshed at least as often as {{DATA_FRESHNESS_SLA}}.
   - Expose the schema as a callable helper (`describe_table(name)`) rather than a static docstring, so the agent's first move on an unfamiliar table is a live lookup, not a guess from a stale comment.
   - Invalidate any locally cached metric dictionary copy on the same schedule; a stale formula for a renamed metric produces a confidently wrong number.
3. **Give it execution, not just description.** Provide a schema reflection tool and a dataframe or query execution tool (`pandas.read_sql` against a read-only connection, or your warehouse client's native cursor) so metric analysis, cohort matrices, and chart-data prep run against real rows.
   - Cap any interactive query at {{ROW_LIMIT_DEFAULT}} rows by default; require an explicit override for a full pull.
   - A notebook cell that silently pulls a full production table blocks the kernel and can exceed {{QUERY_COST_THRESHOLD}} without warning, so surface the estimated scan size before running anything unbounded.
   - Push aggregation (`GROUP BY`, `HAVING`) into the SQL layer rather than pulling raw rows into a dataframe and aggregating in pandas; it is both faster and keeps memory bounded on a shared kernel.
4. **Keep it read-only, and route writes around it.** No `to_sql`, no `INSERT`/`UPDATE`/`DELETE`, and no writing files outside the notebook's own scratch directory.
   - Any export the analysis produces (a CSV for a stakeholder, a chart image, a table pushed to {{BI_TOOL}}) goes through the pipeline's normal review and publishing step, never through the agent directly.
   - Route any dashboard requiring new infrastructure (a materialized view, a scheduled aggregation job) to {{DASHBOARD_REVIEW_QUEUE}} instead of building it ad hoc in a notebook cell.
5. **Test the notebook-specific failure modes.** Run five scenarios before rollout: a cohort-retention analysis producing the documented matrix format, a dashboard chart-type recommendation for a high-cardinality dataset (must recommend aggregation or a "top N plus other" grouping, not an unreadable chart), a metric-definition question such as ARR vs. MRR (must cite {{METRIC_DICTIONARY_URL}} rather than an assumed formula), a request to visualize a column containing unmasked PII (must refuse and suggest aggregation), and a request to write results back to a production table (must refuse and explain the read-only boundary).
   - Re-run this suite whenever the notebook environment's execution tool is upgraded or reconnected to a new warehouse.
   - Route anything the suite fails on to {{ANALYTICS_TICKET_QUEUE}} before enabling the persona for real notebook users.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Schema reflection (read-only) | Query generation, chart and dashboard SQL | Yes |
| Dataframe / notebook query execution (read-only, row-limited) | Metric analysis, cohort matrices, visualization data prep | Yes |
| Metric dictionary lookup | Metric analysis, cohort and growth workflows | Yes |
| Chart rendering (matplotlib, {{BI_TOOL}} native, or equivalent) | Chart type recommendation, dashboard spec preview | Recommended |
