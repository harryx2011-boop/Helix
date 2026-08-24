# Helix — context

> **v0.1.0-pre** (2026-08-24): WEBSITE.md plan settled; Phase 1 shipped (marketing site, capability pages, docs, agent routes, Clerk auth GitHub+Google, onboarding, /app shell, playground, keys/usage/activity/settings/self-host; every route 200 at 1440/390, tsc+lint clean). Phase 2: seven workflows (scrape, parse, search, crawl, interact, monitor, agent-surfaces) running in nested worktrees `.worktrees/<api>` on branches `api/<api>`, dev ports 3411–3417; merge order per WEBSITE.md §12.

## What this is

Self-hostable, BYOK web-data API (scrape · parse · search · crawl · interact · monitor) with a hosted app at helix.dev. Three runtimes behind one HTTP surface: `apps/api` (TypeScript, Fastify, Playwright pool, jobs), `apps/fetch` (Rust, TLS identity), `apps/extract` (Python, parsing/LLM/embeddings), Postgres + pgvector.

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
- `apps/api` — routes: scrape, map, crawl, search, jobs, keys, health. Port 7400.
- `packages/` — profiles, schema, sdk-ts (empty), cli (planned, `@helix/cli`).
- `supabase/` — migrations for the hosted app (profiles, api_keys, instances, runs, usage_daily).
- `graphify-out/` — knowledge graph; regenerate after structural changes.

## Conventions

- Tokens: WEBSITE.md §3. Marketing = Firecrawl-structured light theme in violet; app = DESIGN.md dark.
- Claims guard (WEBSITE.md §11) applies to every user-facing string.
- Stage by name, commit to main, no AI co-author trailer.
