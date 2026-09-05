---
name: canvas-week-plan
description: Build a study plan for the week from a student's upcoming Canvas work, current grades, and course structure. Trigger phrases - "plan my week", "help me study this week", "build a study schedule", "what should I work on", "prioritize my Canvas work".
---

# Canvas Week Plan

Turn a student's upcoming Canvas workload into a prioritized, day-by-day study plan for the next 7 days.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- A student-level Canvas token.

## Steps

1. Call `get_upcoming_assignments` to collect everything due in the next 7 days across active courses, with due dates and point values.
2. Call `get_grades` for each course involved, to see current standing and identify courses where the student has less margin for a low score.
3. Call `get_course_structure` for each course with upcoming work, to understand what modules or units the assignments belong to and estimate effort (a module with several linked readings implies more prep than a single-page assignment).
4. Prioritize: assignments due sooner and worth more of the grade rank higher; courses where the current grade is already low get extra weight even if the assignment itself is small.
5. Distribute the prioritized list across the remaining days of the week, leaving the day before each due date lighter than the days before it.

## Output format

Markdown, one heading per day from today through 7 days out:

```
## Monday
- [Course] Task: reason (due date, weight, or grade context)

## Tuesday
- ...
```

Close with a one-line "Watch out for" note calling out the single highest-risk item (soonest due date combined with heaviest weight or lowest current grade). Do not invent effort estimates beyond what the course structure and point values support: say "unclear from Canvas data" rather than guessing a number.
