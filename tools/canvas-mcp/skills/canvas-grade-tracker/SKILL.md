---
name: canvas-grade-tracker
description: Track grades across courses, run what-if scenarios on remaining points, and flag courses falling below a target threshold. Trigger phrases - "check my grades", "what's my grade in", "what do I need to get an A", "what-if I score X", "am I passing", "flag low grades".
---

# Canvas Grade Tracker

Report current grades per course and answer what-if questions using remaining points possible.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- A student-level Canvas token.
- If running a what-if scenario, know which course and which assignments are still outstanding.

## Steps

1. Call `get_grades` for all active courses (or a single named course if the student asked about one).
2. For any course the student wants a what-if on, call `list_assignments` for that course to find remaining ungraded or upcoming assignments and their points possible.
3. Compute the what-if: given the current points earned and points possible so far, add the hypothetical score on the named assignment(s) and recompute the projected course percentage. Show the arithmetic, not just the result.
4. Compare each course's current percentage against the threshold the student named (default 70% if none was given) and flag any course below it.
5. If a course's grade looks stale (no assignments graded recently despite due dates passing), note that separately: it may mean grading is pending, not that work is missing.

## Output format

Markdown table, one row per course:

```
| Course | Current grade | Status |
|---|---|---|
| Course name | 87.3% | OK |
| Course name | 64.0% | Below threshold (70%) |
```

Follow with a "What-if" subsection only if the student asked a what-if question, showing the specific calculation:

```
### What-if: [Course]
Current: 420/500 points (84.0%)
If you score 18/20 on [Assignment]: 438/520 points (84.2%)
```

Never state a projected grade without showing the points-earned/points-possible math behind it.
