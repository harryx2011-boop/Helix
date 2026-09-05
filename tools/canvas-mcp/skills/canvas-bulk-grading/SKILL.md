---
name: canvas-bulk-grading
description: Grade a batch of submissions for an assignment, with or without a rubric, using a preview-then-confirm loop. Trigger phrases - "grade these submissions", "bulk grade this assignment", "grade with the rubric", "apply grades to the class".
---

# Canvas Bulk Grading

Grade multiple submissions for one assignment in a single pass, showing every proposed grade before anything is written to Canvas.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- An educator-level Canvas token (student tokens cannot grade).
- The course and assignment to grade, and either a grading rule (e.g. "10 points for a submission, 5 if late") or a rubric already attached to the assignment.

## Steps

1. Call `list_submissions` for the assignment to see who has submitted, what they submitted, and current grading status.
2. If grading against a rubric, call `get_rubric` (via `list_rubrics` first if the rubric id isn't known) to see the criteria and point values.
3. Build the proposed grade for each submission:
   - No rubric: call `bulk_grade_submissions` without `confirm` to get a preview of the grades that would be applied.
   - Rubric-based: call `grade_with_rubric` without `confirm` per submission (or in the batch form if supported) to preview rubric scores and comments.
4. Present the full preview to the educator as a table before touching anything else. Wait for explicit approval, including any corrections to individual grades.
5. Re-run the same call(s) with `confirm=true` only for the submissions approved as-is (or with the educator's corrections applied).
6. Report which submissions were graded and any that were skipped or failed.

## Output format

Preview table, before any confirm call:

```
| Student | Submission | Proposed grade | Notes |
|---|---|---|---|
| Name | Link/summary | 18/20 | Late, -2 |
```

After confirmation, a short summary: `Graded N of M submissions in [Assignment].` List any skipped or failed submissions with the reason. Never call `bulk_grade_submissions` or `grade_with_rubric` with `confirm=true` on a submission that wasn't shown in a prior preview.
