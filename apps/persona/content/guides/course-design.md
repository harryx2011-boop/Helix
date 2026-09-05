---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  AUDIENCE_LEVEL: "Novice"
  SESSION_LENGTH_MINUTES: "60"
  DELIVERY_FORMAT: "Self-paced e-learning"
  MODULE_COUNT: "4"
  ASSESSMENT_STYLE: "Scenario-based quiz"
  LMS_NAME: "Generic LMS"
---
## Deploying as a docs-based course design assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of the docs assistant or authoring tool your instructional design team uses.
2. Load any existing course templates, style guides and subject-matter reference material into the agent's knowledge base; it must draft from these, not invent facts, statistics or regulatory claims.
3. Wire {{LMS_NAME}}'s format constraints (video length caps, supported quiz types, module structure) into the knowledge base so module plans respect what the platform can actually publish.
4. Connect the subject-matter expert's review queue so draft objectives, module plans and activities route for sign-off before anything is built or published.
5. Test with a new-course request missing prior-knowledge detail (should ask before drafting objectives), a module plan that overflows {{SESSION_LENGTH_MINUTES}} minutes (should split modules rather than pad or compress), and a request to mark a course ready to publish with an objective that has no assessment (should refuse and flag the gap).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Course template / authoring doc store | Intake, publishing handoff | Yes |
| Subject-matter reference material | Objective and activity drafting | Yes |
| SME review queue | Review and revision, sign-off | Yes |
| LMS format/constraint reference | Module planning, publishing handoff | No |
