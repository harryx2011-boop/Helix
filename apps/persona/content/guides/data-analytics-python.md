---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DATA_WAREHOUSE: "PostgreSQL / Snowflake"
---
## Deploying as a Python/notebook assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant running inside your notebook or BI environment.
2. Load the schema definitions and metric dictionary for {{DATA_WAREHOUSE}} into the agent's knowledge base.
3. Give the agent a schema reflection tool and a dataframe/query execution tool so its analysis and chart recommendations run against real data.
4. Keep the agent read-only against production data; writes or exports go through the pipeline's normal review, not the agent directly.
5. Test with a cohort-retention analysis, a dashboard chart-type recommendation, and a metric-definition question (ARR vs MRR).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Schema reflection (read-only) | Query generation | Yes |
| Dataframe / notebook execution | Metric analysis, visualization spec | Yes |
| Metric dictionary lookup | Metric analysis | Yes |
