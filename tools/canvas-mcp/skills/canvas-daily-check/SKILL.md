---
name: canvas-daily-check
description: Check what's due today or this week, what's missing, and what announcements are unread across a student's Canvas courses. Trigger phrases - "what's due today", "what do I have this week", "check Canvas for me", "anything I'm missing", "daily Canvas check", "morning check-in".
---

# Canvas Daily Check

Give a student a fast morning or evening status pull across all their active courses: due work, missing work, and unread announcements.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- A student-level Canvas token (educator-only tools are not needed here).

## Steps

1. Call `get_upcoming_assignments` to list assignments due today and in the next 7 days across all active courses.
2. Call `get_todo` to catch anything on the Canvas to-do list that `get_upcoming_assignments` might not surface (peer reviews, ungraded quizzes owed).
3. Call `get_submission_status` for each course with upcoming or recent work, to flag anything already missing or late.
4. Call `list_announcements` for each active course (or the courses returned by step 1) and note any announcement newer than the student's last check-in.
5. Merge the results: group by course, sort by due date within each course.

## Output format

A single Markdown reply, structured as:

```
## Today
- [Course] Assignment name: due 11:59pm: status

## This week
- [Course] Assignment name: due Wed: status

## Missing / late
- [Course] Assignment name: X days late

## Unread announcements
- [Course] Announcement title
```

Omit any section with nothing to report rather than showing it empty. Keep each line to one sentence. If nothing is due and nothing is missing, say so directly instead of printing empty headers.
