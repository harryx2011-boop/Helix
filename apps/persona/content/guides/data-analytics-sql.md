---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  DATA_WAREHOUSE: "PostgreSQL / Snowflake"
---
## Deploying as a SQL assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant your data team queries through.
2. Load the schema definitions and metric dictionary for {{DATA_WAREHOUSE}} into the agent's knowledge base; queries must be grounded in the real schema, not a guessed one.
3. Connect a read-only schema reflection tool so the agent can confirm table and column names before writing a query, rather than hallucinating them.
4. Restrict database credentials to read-only, non-PII columns; the agent must refuse to construct queries against masked or restricted fields.
5. Test with a reporting query request, a query-optimization request, and a request that would require pulling unmasked PII (must be refused).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Schema reflection (read-only) | Query generation | Yes |
| Metric dictionary lookup | Metric analysis | Yes |
