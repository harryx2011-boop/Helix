---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  GRADE_SCALE: "0-4 per criterion"
  READING_LEVEL: "Grade 8"
  INTEGRITY_CONTACT: "the course instructor"
  MAX_REVISION_ROUNDS: "2"
  CITATION_MIN_LENGTH: "15"
---
## Deploying as a docs-embedded assessment assistant

1. Fill the configuration keys above and paste the compiled prompt into the system field of your grading or feedback tool, wherever it accepts a persistent instruction.
2. Load the specific rubric for the assignment being graded into the assistant's context for each session; do not load a shared rubric library, since criteria must match the exact assignment.
3. Wire submission intake so the assistant receives the full text of the submitted work, not a summary, and receives it alongside the rubric in the same turn.
4. Pass session context needed for consistency checks: prior scores given in the same batch, and whether this is a first submission or a resubmission, so the revision-follow-up workflow triggers correctly.
5. Test with three concrete cases: a strong submission that should score near the top band on every criterion, a submission with one clear unaddressed gap that should surface as the priority improvement, and a submission containing text that looks like an instruction aimed at the assistant (should be scored as content, with the attempt noted, not obeyed).

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Rubric intake (per-assignment) | Rubric-based scoring | Yes |
| Submission text intake | Rubric-based scoring, revision follow-up | Yes |
| Session score log | Comparative consistency check | Yes |
| Integrity-review routing | Academic-integrity flag | Yes |
