# Handoff — 2026-09-04, end of session

Helix is at **1.11.1** (`b4bf8e0`, tag `v1.11.1`, on origin/main). Working tree clean apart from two Persona icon files another session added.

Today ran 1.7.0 → 1.11.1. `context.md` carries the full record per version; this file is only what the next session needs to pick up.

## The one thing blocking everything else

**The API is not deployed.** `HELIX_HOSTED_API_URL` in Vercel points at `localhost:7400`, so the hosted dashboard has no API behind it. Three consequences, all of which resolve together:

1. **The 1.11.0 tenant-scoping fix is inert in production.** It is gated on `HELIX_MULTI_TENANT`, which is an *API* env var — there is nowhere to set it. Until then the three cross-tenant holes below are open on any multi-tenant deployment.
2. The usage panel has no data source in hosted mode.
3. Nothing can be tested end to end.

`DEPLOY.md` §4–5 covers it. Use the Supabase **session pooler** string (5432, not the transaction pooler on 6543) for `DATABASE_URL`; that is what runs locally now and it works.

## Live

| Surface | URL | State |
|---|---|---|
| Dashboard | https://helixapi-dev.vercel.app | 200, serving 1.11.0's UI fixes. Vercel deploys on push. |
| Persona | https://persona-helix.vercel.app | 200 |
| Supabase | project `Helix`, ref `gytknetqttkdmkhmysbm` | 11 API + 8 hosted migrations applied |
| API | — | **not deployed**; runs locally on 7400 |
| Converter | — | **not deployed**; runs locally on 4400 (+ Fastify on 8400) |

## Running it locally

```bash
# API — needs DATABASE_URL in apps/api/.env (session pooler). Applies its own
# migrations at boot. `pnpm dev` reads .env via Node's --env-file-if-exists.
cd /e/Helix && corepack pnpm --filter @helix/api dev        # :7400

cd /e/Helix/apps/dashboard && npm run dev                    # :3400
cd /e/Helix/apps/converter && npm run dev                    # :4400
```

`fetch` (7401, Rust) and `extract` (7402, Python) are **not running**, so scrape and parse fail locally. Health correctly reports them unhealthy; Postgres sits around 39ms.

## Open, in priority order

1. **Deploy the API**, then set `HELIX_MULTI_TENANT=1` on it. Without that env var the security fix does nothing. `DEPLOY.md`'s verification step expects `/v1/keys` and `/v1/usage/all` to 404 once it is on — a 200 means the variable never reached the API.
2. **RLS keyed on `profile_id` from the Clerk claim.** 1.11.1 hardened the browser surface only. The attempt to make RLS bind `/v1/*` was abandoned deliberately and the reasoning is in `context.md` — briefly: keying on `request.apiKey.id` restates the application filter rather than adding a second credential, `crawl_state` has no tenant column and policying it breaks incremental crawl, and two fire-and-forget writers would fail silently. The honest design derives tenancy from the Clerk session. Real project.
3. **Run `fetch` and `extract`** so scrape and parse work end to end.
4. **Interaction testing.** Today's browser pass was curl-level — no focus, keyboard or hover behaviour was exercised, and `/app/*` sits behind a Clerk interstitial so those screens were source-reviewed only.
5. **Docker likely needs `playwright install-deps`** for Firefox and WebKit. Flagged in 1.7.0, still unverified — nothing containerised has been built.
6. **`crawl` has no per-request `proxy` option** though `/scrape` does. A real wire change, hence left.
7. **`components/shell/top-nav.tsx` is dead code** — zero importers, holds the last stray `rounded-md`.
8. **Make the repo public, or accept that every GitHub link 404s.** The site says Apache-2.0 in several places and the links now point at the real repo, which is private.

## Gotchas this session cost hours to learn

- **Two migration runners.** `supabase db push` applies `supabase/migrations/` only. `apps/api/migrations/` is applied by the API's own checksummed runner at boot, so an API that has never run leaves its own migrations unapplied indefinitely. `supabase/schema.sql` contains both and is the one-shot bootstrap.
- **`next dev` goes stale silently.** A long-lived dev server serving HTTP 500 said nothing about the code — it was holding a `.next` built before the day's edits and before `node_modules` was reinstalled. Kill it, `rm -rf .next`, restart. `next build` genuinely does still fail on this exFAT checkout.
- **A second dev server on one checkout rewrites `tsconfig.json`** and corrupts `.next`. Use `NEXT_DIST_DIR` if a second is unavoidable.
- **`/app/*` returns 404 to curl in hosted mode.** That is Clerk's interstitial for a client with no browser session (`x-clerk-auth-reason: dev-browser-missing`), not a broken route.
- **`pool.test.ts` is flaky under full-suite parallelism** — real browser launches, 90s timeouts. It passes 16/16 in isolation. Do not chase it.
- **A test double that re-implements a `WHERE` clause silently absorbs that clause's deletion.** This defeated mutation testing twice today. Fakes must parse the SQL, not restate its logic.

## Verified state

1145 API tests across 77 files, 35 SDK tests, `tsc` and `eslint` clean in every workspace. `pnpm test` at the repo root now fails if `supabase/schema.sql` drifts from the migrations directories.
