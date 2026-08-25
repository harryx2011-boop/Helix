# Helix — context

> **v0.1.0-pre** (2026-08-24): WEBSITE.md plan settled; Phase 1 shipped (marketing site, capability pages, docs, agent routes, Clerk auth GitHub+Google, onboarding, /app shell, playground, keys/usage/activity/settings/self-host; every route 200 at 1440/390, tsc+lint clean). Phase 2 merged: all six APIs live (scrape, parse, search, crawl, interact incl. live view, monitor) plus MCP server at /mcp and @helix/cli; 12 routes, 20 OpenAPI paths, 545 API tests; every marketing and /app route 200 at 1440/390.

## What this is

Self-hostable, BYOK web-data API (scrape · parse · search · crawl · interact · monitor) with a hosted app at helix.dev. Three runtimes behind one HTTP surface: `apps/api` (TypeScript, Fastify, Playwright pool, jobs), `apps/fetch` (Rust, TLS identity), `apps/extract` (Python, parsing/LLM/embeddings), Postgres + pgvector.

Interact (`apps/api/src/routes/interact.ts`, `browser/sessions.ts`, `browser/interact-actions.ts`, `browser/screencast.ts`): sessions lease a page from the Playwright pool (`BrowserPool.lease`), bounded by `HELIX_INTERACT_MAX_SESSIONS` / `_IDLE_TIMEOUT_SECONDS` / `_HARD_TIMEOUT_SECONDS`; the live view at `/v1/interact/live/{id}?token=` is token-authenticated (the auth hook skips that prefix) and streams CDP screencast frames over SSE. `HELIX_PUBLIC_URL` builds the live-view link.

## Documents

| Doc | Role |
|---|---|
| WEBSITE.md | Plan of record for the site, app, auth, onboarding, agent surfaces, API catalog, build phases |
| ARCHITECTURE.md | System design and principles |
| DESIGN.md | Tokens and the character-animation motif |
| FRONTEND.md | The self-host dashboard plan (now the self-host build mode of `apps/dashboard`) |
| MILESTONES.md | Build state: M0–M5 done, M6 in progress, M7–M9 not started |
| openapi.yaml | Wire contract; being reconciled with code (see WEBSITE.md §11) |
| research/ | Evidence: Firecrawl teardown, visual system, copy, interaction, API landscape, feasibility, api-specs/ |

## Layout

- `apps/dashboard` — one Next.js app: marketing (light), Clerk auth, onboarding, `/app` dashboard (dark). Port 3400. `HELIX_HOSTED=1` selects hosted mode.
- `apps/api` — routes: scrape, parse, map, crawl, search, monitor, interact (+ live view), jobs, keys, health, internal (key sync), mcp. Port 7400. Search backends: SearXNG (`SEARXNG_URL`, no key), Serper, SerpAPI; `HELIX_SEARCH_PROVIDER=auto` picks the first configured.
- `packages/` — profiles, schema, sdk-ts (empty), cli (`@helix/cli`: `init --all -k <key>` writes MCP config + SKILL.md for Claude Code, Cursor, Codex, Windsurf; unpublished).
- `supabase/` — migrations for the hosted app (profiles, api_keys, instances, runs, usage_daily).
- `graphify-out/` — knowledge graph; regenerate after structural changes.

## Motion and prompt box (2026-08-25)

- `components/marketing/animated-code.tsx`: `scramble` (JSON values cycle glyphs and resolve independently; keys static), `type` (14ms/char, blinking cursor), `reveal` (per-line fade-in-up), `static`; `playOnView`, reduced-motion renders the settled frame. Used by the hero panel (request types → response scrambles, loops), the capabilities code sample, and every capability-page mock. Evidence: research/17.
- Prompt box: hero input and `/app` playground (`components/playground/prompt-box.tsx`) — icon, input with rotating placeholder (text-swap 150ms/4px/2px blur), endpoint pills inside the box, toolbar (Options · Source · Get code · Run).

## Landing page rebuild (2026-08-25)

Full rebuild of `/` per `landing-revamp-plan.md`'s Helix section. Sections: Nav (Capabilities dropdown, Docs, GitHub, Sign in) → Hero (two-column request/response demo, `Get started` + `View on GitHub` CTAs) → Capabilities (one tabbed code panel, 6 tabs: scrape/parse/search/crawl/interact/monitor, each linking to its page) → Integrations (SDK/MCP/CLI copyable install snippets) → Self-host promise (rewritten copy, ambient `CharGrid` texture) → Use cases (rewritten) → Closing CTA. `objection-a.tsx`, `objection-b.tsx`, `ladder-replay-link.tsx` removed (folded out or superseded). No social proof, stats, pricing, or testimonials, per spec.

Added `gsap` + `lenis` to `apps/dashboard` (`components/marketing/scroll-motion.tsx`, mounted in `(marketing)/layout.tsx`): Lenis smooth scroll driven by the GSAP ticker, plus a `[data-reveal]` / `[data-reveal-group] > [data-reveal-item]` convention for scroll-triggered section reveals (`power3.out`, 500ms, 60ms stagger, `once: true`). `html.has-motion` gates the CSS visibility hook in `globals.css`; reduced-motion skips Lenis and reveals everything immediately via `clearProps`. Ambient background code motion stays on `char-grid.tsx`/`animated-code.tsx` (unchanged primitives), now also used behind the self-host section.

## Conventions

- Tokens: WEBSITE.md §3. Marketing = Firecrawl-structured light theme in violet; app = DESIGN.md dark.
- Claims guard (WEBSITE.md §11) applies to every user-facing string.
- Stage by name, commit to main, no AI co-author trailer.
