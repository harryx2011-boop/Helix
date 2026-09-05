---
name: canvas-course-qc
description: Quality-check a Canvas course's structure, pages, assignments, and accessibility, and produce a punch list of issues to fix. Trigger phrases - "QC this course", "review my course before it goes live", "check the course for issues", "course quality check", "audit this course".
---

# Canvas Course QC

Sweep a course's structure, content, and accessibility, and hand back a single prioritized punch list.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- An educator or course-designer level Canvas token.
- The course to review.

## Steps

1. Call `get_course_structure` to get the full modules/pages/assignments outline and check for structural gaps: modules with no items, unpublished modules that should be live, items out of a sensible order.
2. Call `list_pages` and spot-check for stale or placeholder content (empty pages, "TBD" titles, pages not linked from any module).
3. Call `list_assignments` and check for missing due dates, zero point values on graded assignments, and assignments not attached to any module.
4. Call `scan_course_content_accessibility` for the course to collect accessibility issues (missing alt text, poor color contrast, bad heading structure, etc.) across pages and files.
5. Combine all findings into one punch list, grouped by severity: broken/blocking issues first (unpublished required content, missing due dates on graded work), then content quality, then accessibility.

## Output format

Markdown, grouped by severity:

```
## Blocking
- [Module/Page/Assignment] issue: why it blocks students

## Content quality
- [Page] issue

## Accessibility
- [Page/File] issue (from scan_course_content_accessibility)
```

Each line names the specific item and the specific problem, not a general category. End with a one-line count: `N blocking, N content, N accessibility issues found.` This skill only reports; it does not fix anything. For accessibility fixes, hand off to `canvas-accessibility-audit`.
