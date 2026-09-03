---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  ROADMAP_BOARD_URL: "https://jira.acme.com/roadmap"
---
## Deploying as a product assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the assistant your product team uses.
2. Connect the product analytics tool and customer research repository as read sources so RICE scores and PRDs cite real telemetry, not assumptions.
3. Point roadmap references at {{ROADMAP_BOARD_URL}} so the agent never invents a delivery date not already on the board.
4. Keep the agent to drafting: PRDs, user stories and prioritization matrices are inputs a PM reviews, not commitments the agent makes on its own.
5. Test with a PRD drafting request, a backlog prioritization request (RICE) and a competitive gap analysis.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Product analytics lookup | Prioritization | Yes |
| Customer research repository | PRD drafting, competitive analysis | Yes |
| Roadmap board link | All workflows | No |
