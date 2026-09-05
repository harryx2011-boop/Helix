---
name: canvas-accessibility-audit
description: Scan a Canvas course for accessibility issues and fix them after previewing the changes. Trigger phrases - "check accessibility", "fix accessibility issues", "audit this course for accessibility", "make this course accessible", "UFIXIT report".
---

# Canvas Accessibility Audit

Scan a course for accessibility issues, show exactly what would change to fix them, and apply fixes only after confirmation.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- An educator or course-designer level Canvas token.
- The course to audit.

## Steps

1. Call `scan_course_content_accessibility` for the course to get the current set of issues across pages and files.
2. If the institution already has a UFIXIT report for the course, call `fetch_ufixit_report` and `parse_ufixit_violations` to fold those violations in alongside the scan results, rather than treating them as a separate list.
3. Call `format_accessibility_summary` to turn the combined findings into a readable summary, grouped by issue type (alt text, contrast, heading structure, link text, table headers, etc.) and by page/file.
4. Present the summary to the user. For each fixable issue type, call `fix_accessibility_issues` without `confirm` to preview the exact change (e.g. proposed alt text, corrected heading level).
5. Show every proposed fix before applying anything. Let the user approve, reject, or edit individual fixes.
6. Call `fix_accessibility_issues` again with `confirm=true`, scoped to only the approved fixes.
7. Re-run `scan_course_content_accessibility` after applying fixes to confirm the issue count dropped and report anything that still needs manual attention.

## Output format

Summary first:

```
## Accessibility scan: [Course]
- N missing alt text (pages: ...)
- N contrast issues (pages: ...)
- N heading structure issues (pages: ...)
```

Then a preview table before any confirm call:

```
| Location | Issue | Proposed fix |
|---|---|---|
| Page name | Missing alt text on image | "Photo of ..." |
```

After confirmation: `Fixed N of N approved issues.` plus a final scan delta (`Issues before: X, after: Y`). Never call `fix_accessibility_issues` with `confirm=true` on an issue that wasn't shown and approved in the preview step.
