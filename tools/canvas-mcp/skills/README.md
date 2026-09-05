# CanvasLMS - API skills

Agent skills built on top of the CanvasLMS - API MCP server. Each skill is a self-contained folder with a `SKILL.md` describing when it triggers, the exact tools it calls, and its output format.

## Install

Copy the skill folder you want into your skills directory:

- Global, all projects: `~/.claude/skills/`
- This project only: `.claude/skills/` at the project root

Example:

```bash
cp -r skills/canvas-daily-check ~/.claude/skills/
```

All skills assume CanvasLMS - API is already connected to your MCP client and `canvaslms-api --test` succeeds.

## Student skills

| Skill | Purpose |
|---|---|
| `canvas-daily-check` | What's due today/this week, what's missing, unread announcements. |
| `canvas-week-plan` | Build a study plan from upcoming work, grades, and course structure. |
| `canvas-grade-tracker` | Track grades per course, run what-if scenarios, flag low grades. |
| `canvas-discussion-helper` | Read a discussion thread, draft a reply, post after confirmation. |

## Educator skills

| Skill | Purpose |
|---|---|
| `canvas-bulk-grading` | Grade a batch of submissions, with or without a rubric, preview then confirm. |
| `canvas-course-qc` | Structure, content, and accessibility punch list for a course. |
| `canvas-accessibility-audit` | Scan accessibility issues, preview fixes, apply after confirmation. |
| `canvas-peer-review-manager` | Peer review completion tracking and reminder messaging. |

Every write action in every skill follows the same rule as the underlying tools: nothing changes in Canvas until you have seen a preview and explicitly confirmed it.
