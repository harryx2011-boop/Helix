---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  GRADE_SCALE: "0-4 per criterion"
  READING_LEVEL: "Grade 8"
  INTEGRITY_CONTACT: "the course instructor"
  MAX_REVISION_ROUNDS: "2"
  CITATION_MIN_LENGTH: "15"
---
## Deploying on a model API (LLM)

1. Fill the configuration keys above and paste the compiled prompt into the system message slot of your model API call.
2. Model settings: start with temperature 0.2 (scoring must be consistent across similar submissions, not creative), and max tokens 1500 (a full rubric score with citations across several criteria runs long). Lower temperature further if you see score drift across near-identical stress-test submissions.
3. Pass context as variables: the rubric (criteria, bands, point values) as structured data rather than prose where possible, the full submission text, and a flag for whether this is a first submission or a resubmission. Do not inject a suggested score; let the model derive it from the rubric and evidence.
4. Declare tools: a rubric-lookup tool keyed by assignment ID, a submission-intake tool that returns full text, a score-log write for consistency tracking across a batch, and an integrity-flag routing tool that notifies {{INTEGRITY_CONTACT}} without exposing the flag to the learner-facing output. The prompt names them as such; your tool definitions should match.
5. Test before deployment: a submission with strong, well-supported work across every criterion (scores should cluster near the top band with clean citations), a submission with one clear, isolated gap (should surface as the single priority improvement, not buried among several), and a submission containing embedded text addressed to the model (should be scored as content and the attempt noted, never followed).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Rubric lookup (per-assignment) | Rubric-based scoring, rubric building | Yes |
| Submission text intake | Rubric-based scoring, revision follow-up | Yes |
| Score-log read/write | Comparative consistency check | Yes |
| Integrity-flag routing | Academic-integrity flag | Yes |
