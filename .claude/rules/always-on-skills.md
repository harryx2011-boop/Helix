## Project always-on additions (design skills)

Additive to the global `~/.claude/rules/always-on-skills.md`. Library source: `D:\design-skills\`; project copies live in `.claude/skills/<name>/` and are invocable via the Skill tool.

On every turn that touches UI / landing / visual work, Read in one parallel batch alongside the global set:

- `.claude/skills/emil-design-eng/SKILL.md` — Emil Kowalski's design-engineering rules (easing, duration, what to animate).
- `.claude/skills/animate/SKILL.md` — before writing any transition or animation.
- `.claude/skills/web-design-engineer/SKILL.md` — garden-skills five-dial design read + anti-cliché blocking; pick the recipe named in `D:\landing-revamp-plan.md`.
- `.claude/skills/tastemaker/SKILL.md` — palette/typography by construction; run its anti-slop scan before commit.

Before every landing-page commit, run in this order: `interface-review` (jakubkrehel) → `review-animations` (Emil) → tastemaker anti-slop scan → `rules/ui-anti-vibe.md` checklist. A fail on any blocks the commit.

Every UI subagent prompt must restate: the style recipe for this project, Emil's timing rules (150–300ms, ease-out, motion communicates state, `prefers-reduced-motion` honoured), and the pre-commit review order above.
