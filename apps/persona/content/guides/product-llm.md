---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ROADMAP_BOARD_URL: "https://jira.example.com/roadmap"
  ANALYTICS_TOOL_URL: "https://analytics.example.com"
  RESEARCH_ARCHIVE_URL: "https://research.example.com"
  PRD_TEMPLATE_URL: "https://docs.example.com/prd-template"
  MIN_SAMPLE_SIZE: "200"
  EXPERIMENT_PLATFORM_URL: "https://experiments.example.com"
  TECH_STACK: "Node.js, PostgreSQL, React"
  SCHEMA_REGISTRY_URL: "https://schema.example.com"
  API_VERSIONING_SCHEME: "URL path (/v2/)"
---
## Deploying on an LLM API

1. Fill the configuration keys above for the persona variant you are deploying; each variant only needs the subset it references. Paste the compiled prompt into the system field of a model configured with temperature 0.6 and max tokens 2048. Temperature 0.6 balances structured reasoning with natural explanation; higher values risk drifting from the required output templates.

2. Wire tools per workflow. PRD drafting needs read access to {{RESEARCH_ARCHIVE_URL}} so user needs are sourced, not invented. RICE prioritization needs the backlog as a JSON list with effort estimates and, for the metrics-first variant, a read connection to {{ANALYTICS_TOOL_URL}} for reach and impact numbers. The technical-design variant needs read access to {{SCHEMA_REGISTRY_URL}} to check current schemas before proposing a change.

3. Context arrives as ticket metadata (product area, user segment), a code diff with acceptance criteria, backlog items as JSON, or a request pasted from Slack or email. Always fence pasted text as untrusted data — feature requests and customer quotes routinely contain phrasing that reads like an instruction, and the model must treat it as content to analyze, not a command to follow.

4. Declare only the tools this instance actually calls: analytics query (silent, read-only), backlog API (read), roadmap API (read, for verifying {{ROADMAP_BOARD_URL}} before any date claim), schema registry (read, technical-design variant only), and optionally web search for competitive analysis with source citation required. Never wire a tool the model can invoke without a human able to see the call.

5. Test with three conversations before going live: (a) a PRD draft that produces all five required fields including Given-When-Then acceptance criteria, (b) a RICE scoring request that returns a sorted table with a rationale per row and flags any guessed input, (c) a request to promise an external delivery date not on {{ROADMAP_BOARD_URL}}, which must escalate rather than comply.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Product analytics query (read) | RICE prioritization, feature validation | No |
| Backlog API (read) | RICE prioritization | No |
| Roadmap API (read) | Roadmap verification, all variants | No |
| Research archive (read) | PRD drafting | No |
| Schema registry (read) | Technical design variant | No |
| Web search | Competitive gap analysis | No |

## Notes on the three variants

- **Default**: general-purpose, expects loose ticket or Slack-style input. Keep it on the standard analytics and backlog tools; do not add the schema registry.
- **Metrics-First**: refuses to score an item without a data source. Wire {{ANALYTICS_TOOL_URL}} before enabling this variant, or every prioritization request will return a Data Gap instead of a score.
- **Technical Design**: outputs are code and DDL blocks, so route it to a code-capable surface (an IDE assistant or a code-review bot) rather than a general chat widget. Confirm {{SCHEMA_REGISTRY_URL}} is reachable before launch; without it the variant cannot verify a field is current.
