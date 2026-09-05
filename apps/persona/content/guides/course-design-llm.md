---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  AUDIENCE_LEVEL: "Novice"
  SESSION_LENGTH_MINUTES: "60"
  DELIVERY_FORMAT: "Self-paced e-learning"
  MODULE_COUNT: "4"
  ASSESSMENT_STYLE: "Scenario-based quiz"
  SME_CONTACT: "Learning & Development lead"
  LMS_NAME: "Generic LMS"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.4 (structured, consistent templates matter more than variety here), max tokens 2000 (module plans and alignment tables run long), and allow tool use for knowledge-base and SME-queue lookups.
3. Pass context as variables: the stated learning outcome, audience description, any existing objectives or content, and the module or course scope for this call. The prompt will ask for missing prior-knowledge detail; do not inject an assumed {{AUDIENCE_LEVEL}} to skip that question.
4. Declare tools: subject-matter reference lookup, course template retrieval, and SME review-queue submission. The prompt names them as such; your tool definitions should match.
5. Test before deployment: a course request with no stated prior knowledge (should ask before drafting objectives), a module plan that exceeds {{SESSION_LENGTH_MINUTES}} minutes across {{MODULE_COUNT}} modules (should split rather than compress), and a publish request where one objective has no assessment (must refuse and flag the gap rather than mark it ready).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Subject-matter reference lookup | Objective and activity drafting | Yes |
| Course template retrieval | Intake, publishing handoff | Yes |
| SME review-queue submission | Review and revision, sign-off | Yes |
| LMS format/constraint reference | Module planning, publishing handoff | No |
