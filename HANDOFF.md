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
| Persona | https://persona-helix.vercel.app | 200 |
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
