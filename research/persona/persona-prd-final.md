# Persona — Product Requirements Document (Final v1.0)

*A sub-brand under Helix. A system-prompt finder that helps users discover, configure, and export purpose-built agent personas for specialized roles inside complex workflows.*

Superseded where they differ by `PERSONA.md` at the repo root (2026-09-02), which adds accounts via the shared Clerk application and the shared Supabase database.

---

## 1. Positioning

| | |
|---|---|
| **Name** | Persona |
| **Relationship** | Sub-brand under Helix, alongside Cortex in the same product family |
| **What it is** | A searchable, filterable library of role-specific system prompts, each with a setup guide, platform-specific tabs, a live templating engine, and an in-browser text editor with export |
| **First-3-seconds goal** | Visitor should feel the *depth and comprehensiveness* of the role library. Breadth is the hook, not speed or trust signaling |
| **Pricing** | Free |
| **Primary users** | Both individual builders and teams standardizing agent rollout |
| **Accounts** | None in the PRD: fully anonymous, local browser storage, teams share via exportable links. (PERSONA.md adds an optional account through the shared Clerk application.) |
| **Timeline** | Weekend build |
| **Definition of success (v1)** | A full, working build, not a prototype or portfolio piece |

---

## 2. Brand & Visual System

Research basis: live screenshots pulled via Playwright from **cortex-browser.vercel.app**, **helixapi-dev.vercel.app**, and **notion.com**.

| Axis | Decision |
|---|---|
| Theme | Light, in the Helix tradition |
| Typography | **Inter** throughout (Notion's computed font is a self-hosted "NotionInter"; Inter is the public equivalent). Single family, weight 600 for headlines, weight 500 for accent/pill text. No secondary display font. |
| Monospace | JetBrains Mono for code, config values, and meta labels |
| Accent color | **Black + blue, minimalist.** Blue (`#2F6FE4`) is reserved strictly for primary actions: buttons, links, active states. Not used decoratively elsewhere. |
| Role color-coding | Each of the 11 roles keeps its own tint (hero pill, browse-grid icons, filter chips). Content color-coding, distinct from the blue "action" accent. |
| Icon system | **100% `lucide-react`.** No company favicons anywhere. Platforms are generic: Email → `Mail`, Chat → `MessageCircle`, Code → `Terminal`, Security → `Shield` |
| Logo | Selected from the 20-concept set delivered earlier. **Final pick still open** |
| Grid background | Cortex-style dot/line grid with a soft blue radial glow and corner plus-marks, on the hero and other important sections (wizard cards, editor backdrop), not the whole site |

---

## 3. Landing Page & Hero

- **Headline pattern:** Bold Inter headline with an inline **animated role pill** cycling through role names (Support, Sales, Security, FinOps, HR, DevRel…) on a fixed timer (not reactive to search). Each word carries its own tinted background, dot, and text color. Rendered in JetBrains Mono to read as a "live template variable", foreshadowing the templating engine.
- **Hero search demo:** A small floating browser-chrome card beneath the CTA row runs a **looping cursor-and-typing animation**: a fake cursor glides to the search input, clicks (focus ring + scale-bounce), types a query character-by-character at natural variable speed, reveals matching role results with a staggered fade-in, holds, then backspaces and resets to the next query.
- **CTAs:** "Browse the library" (primary, black) and "See how it works" (ghost/outline).
- **Laptop mockup:** Flat browser-window style (Cortex-style, not an angled chassis). A **real, fully interactive iframe of the actual app** at its own routes (`/roles`, `/roles/[slug]`).
- **Template-fill wizard card:** Below the hero, a striped, animated blue progress bar (Helix-style motion) auto-advancing through 4 steps with step-dot indicators.
- **Loading states:** Content sections show shimmering skeleton placeholders for ~2 seconds before revealing real content.

---

## 4. Content Model

- **Roles at launch:** All 11: Customer Success, Data Analytics, Developer Relations, FinOps, HR, Marketing, Product, Sales, Security, Support (Email), Support (Chat).
- **Authoring:** All 11 rewritten to a consistent voice and structure before launch.
- **Role → Persona mapping:** A role can have **multiple competing personas**, presented via a **dropdown selector** on the role page.
- **Setup-guide tabs:** Vary per role (Support = Email vs. Chat; Data Analytics = SQL vs. Python). A tab switch updates the code/preview panel live.
- **Platform labeling:** Fully generic (Email, Chat, Code, Voice), each with a `lucide-react` icon. AI-provider names may appear as plain text where technically relevant, never as branded icons.
- **Versioning:** Full version history/changelog per prompt.

---

## 5. Templating Engine (config-key fill)

1. Deterministic engine scans the selected prompt for `{{PLACEHOLDER}}` tokens.
2. Launches a **step-by-step conversational GUI** asking for each value in turn.
3. Answers substitute live into the prompt text.
4. Progress is shown via the striped blue step-bar.
5. Values/API keys used by the engine are stored in **Settings**, client-side only.

The uploaded `ai_agent_integration_wizard.txt` becomes this interactive feature.

---

## 6. App Shell: Sidebar

- **Position:** Left, open by default. Present across every app route.
- **Collapse:** An icon-toggle button, and dragging the resize handle past a threshold snaps it to a collapsed rail.
- **Resize:** Drag handle adjusts width within a clamped range (width-resize only).
- **Tabs:** Search (input + filter groups Department, Platform, Tone; chip-style) and Settings (theme toggle, API key field for the templating engine, saved forks list).

---

## 7. Text Editor

- **Trigger:** A burger (⋮) menu on every prompt card: Open in Text Editor, Download, Copy prompt, Duplicate/fork, Share link, Favorite/save.
- **Opens as:** A dedicated route, not a modal.
- **Editing:** Notion-style block editor with a formatting toolbar (bold, italic, heading, bullet list at minimum). Edits are a fork of the original.
- **Export formats:** `.md`, `.txt`, `.json`, `.pdf`.
- **Persistence:** Local browser storage indefinitely, until the user clears it.

---

## 8. Search & Discovery

- **v1:** Keyword/role search, filters (department, platform, tone), and a browse-all grid view.
- **Stretch goal:** Natural-language search via embeddings/semantic search.

---

## 9. Sharing & Teams

- Teams share a customized configuration via a **shareable link that exports the config**; the recipient opens it with no login.

---

## 10. Technical

| | |
|---|---|
| Stack | Next.js + Tailwind + shadcn/ui |
| Animation | Framer Motion for entrance choreography and the role pill (`role-pill.tsx`); CSS for the sidebar, progress bars, and skeleton loaders |
| Icons | `lucide-react` exclusively |
| Deployment | Vercel (consistent with Cortex and Helix) |
| SEO | Each role page indexable: SSG/SSR per route, not a client-only SPA |

---

## 11. Open Items

1. Final logo pick from the 20 delivered concepts (or a new direction).
2. Copy/voice guidelines for the standardized rewrite of the 11 personas.
3. Exact trigger/placement for launching the templating-engine wizard from a role page.
4. Whether the duplicate/versioned Support Agent files represent real alternate personas or drafts. (Answered in PERSONA.md §5.)
5. Whether the rich-text editor toolbar needs more than bold/italic/heading/list.

---

## Appendix: Reference Material

- `content/`: the 27 uploaded persona, setup-guide, configuration-template and wizard files.
- `role-pill.tsx`: production-ready Framer Motion pill component.
- `default_user_avatar.svg`: default placeholder avatar.
- Logo/wordmark concepts: pending final selection (Open Item 1); not in the repo.
