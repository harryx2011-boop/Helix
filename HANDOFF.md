# Handoff — 2026-10-10: backlog audit

The 2026-10-07 handoff below is closed: 2.3.2 is pushed, tagged (`v2.3.2`) and installed. The open work and the restart prompt are in the Helix entry of `~/.claude/BACKLOG.md`, organized by Harry's five suite goals (`SUITE-PLAN.md` Phases 1-6): Phase 1 is partial, Phases 3-6 are not started.

---

# Handoff — 2026-10-07: saved for tomorrow (2.3.0 open)

Nothing was run today. The restart prompt for 2.3.0 (anti-bot pass 2) is saved verbatim in the Helix memory file `project_helix_handoff_2026_10_07.md`. Its First steps are: run `node ~/.claude/hooks/helix-ensure.js`, read every stray diff in the shared tree, commit the 2.3.0 version line if it is still uncommitted, and check the `desktop-apps.mjs --rebuild helix` install. Then ask the four questions it lists.

Open at save time: 2.3.0 committed locally on main (42c68ef, 10e8d60, 9574d0d), unpushed and untagged; the installed desktop app is 2.3.0 against source 2.3.2.

---

# Handoff — 2026-09-27: parked at 2.1.0

Helix is parked. What is left, in order, and the prompt that restarts it live in the Helix entry of `~/.claude/BACKLOG.md`. Everything below is older and kept for its local-run recipes.

---

# Handoff — 2026-09-12: Persona split out, nav Title Cased

**Persona is no longer part of this repo.** It is a standalone project at `D:\Persona` with its
own git history (initial commit `eb1e260`). This session did the split and the nav casing pass.
Everything below the next two sections is the older 2026-09-05 handoff, kept for the local-run
recipes; note it still says `/e/Helix`, and the repo is on **D:** now.

## What changed here

- **Nav is Title Case.** `Getting Started`, `API Reference`, `Self-Host Guide`,
  `Agent Onboarding`, `API Keys`, `Open Source`. Page titles for the same destinations were
  aligned too (`docs/page.tsx`, `docs/[slug]/page.tsx`, `lib/docs-content.ts`) so a nav row and
  the page it opens no longer disagree. Running prose was left alone.
- **Persona removed.** The nav row, the footer row, and `PERSONA_URL` in `lib/mode.ts` are gone
  — `PERSONA_URL` had no other consumer. `apps/persona/` and `research/persona/` are deleted;
  `PERSONA.md` and `PERSONA-REVAMP.md` moved to the new repo. Dropped from `pnpm-workspace.yaml`
  (231 packages left the lockfile).
- **Persona's tables left the schema.** Hosted migrations `0002_persona`, `0004_persona_sync`
  and `0009_persona_share_origin` are deleted and both schema files regenerated (18 migrations,
  zero `persona` matches). Safe because `migrate.ts` iterates files on disk, so a
  `schema_migrations` row with no file is ignored — it cannot break boot.
- **DEPLOY.md** no longer claims Persona shares this database or this Clerk application.

Verified: dashboard `tsc` and `eslint` clean, `next build` green (191 pages), `check-schema.mjs`
reports both schema files current, and the served HTML has 3 hits each for the Title Case labels
and 0 for the old casing and for `Persona`.

## Two things deliberately left open

1. **The `persona_*` tables still exist in the live Supabase project.** Dropping them is
   destructive and needs your approval; the migrations that created them are gone from the repo,
   so the code and the live database disagree until you drop them.
2. **`apps/dashboard/lib/supabase/database.types.ts` still declares those tables**, because it is
   generated from the live database by the Supabase CLI. Regenerate it after the drop. No
   dashboard code reads them — checked — so this is cosmetic until then.

## Next session: the Persona landing revamp

Harry is sending a reference website. The brief so far: **keep the alternating role pill**
(HR / Dev / …) in the hero. Work happens in `D:\Persona`, not here. That repo's README documents
the localStorage model and the new share-link codec.

---

# Handoff — 2026-09-05

Helix is at **1.11.3** (`393992e`, tag `v1.11.3`) on origin/main, with another session's 1.12.0 converter work sitting uncommitted in the tree. That day ran 1.7.0 → 1.11.3. `context.md` carries the full record per version; this file is only what the next session needs to pick up.

## State: the full stack runs locally

All three runtimes are up and every endpoint has been exercised against them. `/v1/health` reports `ok` — postgres ~46ms, fetch ~3ms, extract ~5ms, browser ok.

**Hosting is a choice, not a blocker.** The public dashboard at helixapi-dev.vercel.app has no API behind it (`HELIX_HOSTED_API_URL` points at localhost), so it is a shell for anyone but you. That only matters if you want other people using it. Nothing local depends on it.

Related, and worth stating because an earlier version of this file got it wrong: **`HELIX_MULTI_TENANT` is not blocked on deployment.** It matters only when several people share one instance. Locally you are the single operator, which is exactly what the flag defaults to — the cross-tenant holes it closes are real for a public multi-tenant API and are not holes on this machine.

## Live

| Surface | URL | State |
|---|---|---|
| Dashboard | https://helixapi-dev.vercel.app | 200, serving 1.11.0's UI fixes. Vercel deploys on push. |
| Supabase | project `Helix`, ref `gytknetqttkdmkhmysbm` | 11 API + 8 hosted migrations applied |
| API | — | **not deployed**; runs locally on 7400 |
| Converter | — | **not deployed**; runs locally on 4400, fully client-side (ffmpeg.wasm) |

## Running it locally

All four are running now; this is how to bring them back after a reboot.

```bash
# extract (Python) — the venv already exists; do NOT use a bare `python`
cd /e/Helix/apps/extract && .venv/Scripts/python.exe -m uvicorn helix_extract.main:app --port 7402 --host 127.0.0.1

# fetch (Rust) — first build is ~7m for BoringSSL, cached after that
cd /e/Helix/apps/fetch && cargo run --release            # :7401

# API — reads apps/api/.env, applies its own migrations at boot
corepack pnpm --filter @helix/api dev     # :7400

cd /e/Helix/apps/dashboard && npm run dev                # :3400
cd /e/Helix/apps/converter && npm run dev                # :4400, fully client-side
```

Verified end to end with real requests, not health checks: scrape returns markdown, parse reads a live arXiv PDF into 43KB of markdown with page markers, map lists sitemap links, metadata pulls real PDF DocInfo, and a crawl completed 3/3 pages — the first real exercise of the job queue, persistent frontier and 1.7.0's lease fix against actual Postgres.

`search` returns 503 until a backend is configured (`SEARXNG_URL`, `SERPER_API_KEY` or `SERPAPI_KEY`). That is configuration, not a fault.

**The 1.11.0 tenant fix is empirically proven.** With a second key standing in for a second tenant: flag off, B reads A's job → 200; flag on → 404, while the owner still gets 200 and both `/v1/keys` and `/v1/usage/all` return 404. Everything before that was tests against fakes.

## Open, in priority order

1. **RLS keyed on `profile_id` from the Clerk claim.** 1.11.1 hardened the browser surface only; `/v1/*` is guarded by application code alone. The attempt to make RLS bind it was abandoned deliberately — the reasoning is in `context.md` 1.11.1, and repeating the obvious design would waste the effort.
2. **Interaction testing.** Every UI check so far has been curl-level. No focus, keyboard or hover behaviour has ever been exercised, and `/app/*` sits behind a Clerk interstitial so those screens have only been source-reviewed.
3. **Configure a search backend** if `/v1/search` should work.
4. **Decide whether the repo goes public.** The site claims Apache-2.0 in several places and every GitHub link 404s while it is private.
5. **`crawl` has no per-request `proxy` option** though `/scrape` does. A wire change, hence left.
6. **`components/shell/top-nav.tsx` is dead code** — zero importers.
7. **Host the API** only if the public dashboard should work for other people. Then set `HELIX_MULTI_TENANT=1` on it; `DEPLOY.md`'s verification expects `/v1/keys` and `/v1/usage/all` to 404 once it is on.

## Gotchas this session cost hours to learn

- **Two migration runners.** `supabase db push` applies `supabase/migrations/` only. `apps/api/migrations/` is applied by the API's own checksummed runner at boot, so an API that has never run leaves its own migrations unapplied indefinitely. `supabase/schema.sql` contains both and is the one-shot bootstrap.
- **`next dev` goes stale silently.** A long-lived dev server serving HTTP 500 said nothing about the code — it was holding a `.next` built before the day's edits and before `node_modules` was reinstalled. Kill it, `rm -rf .next`, restart. `next build` genuinely does still fail on this exFAT checkout.
- **A second dev server on one checkout rewrites `tsconfig.json`** and corrupts `.next`. Use `NEXT_DIST_DIR` if a second is unavoidable.
- **`/app/*` returns 404 to curl in hosted mode.** That is Clerk's interstitial for a client with no browser session (`x-clerk-auth-reason: dev-browser-missing`), not a broken route.
- **`pool.test.ts` is flaky under full-suite parallelism** — real browser launches, 90s timeouts. It passes 16/16 in isolation. Do not chase it.
- **A test double that re-implements a `WHERE` clause silently absorbs that clause's deletion.** This defeated mutation testing twice today. Fakes must parse the SQL, not restate its logic.

## Verified state

1219 API tests across 83 files (including another session's 1.12.0 converter work), 35 SDK tests, `tsc` and `eslint` clean in every workspace. `pnpm test` at the repo root now fails if `supabase/schema.sql` drifts from the migrations directories.
