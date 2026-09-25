# Deploying the hosted backend

> **Superseded 2026-09-25 (`DESKTOP-PLAN.md` Phase 2b).** Hosted mode is gone: the dashboard has no
> Clerk, no Supabase client, no onboarding and no `app/api/**`, and the website on Vercel serves
> marketing and docs only. What follows is kept as history. The Clerk app, the Supabase project
> (`gytknetqttkdmkhmysbm`) and the Vercel env vars it names still exist and are the owner's to retire;
> `supabase/` and `HELIX_MULTI_TENANT` on the API go with Phase 3.

The dashboard is live at `https://helixapi-dev.vercel.app`. **Done on
2026-09-02:** the Supabase project exists (`Helix`, ref `gytknetqttkdmkhmysbm`,
us-east-2, Postgres 17), `schema.sql` is applied, the CLI is linked and the
hosted migrations are marked applied, the dashboard's env is set locally and in
Vercel production, and a Clerk sign-in → key → Supabase row round trip passed
(`research/firecrawl-capture/probe-hosted-keys.mjs`). **Still open:** the Clerk
webhook (step 3.2), and neither `apps/api` nor `apps/extract` is deployed, so
the playground, Agent and Providers work locally and nowhere else.

This is the sequence that changes that. Steps marked **you** need credentials or
an account only you have; the rest is in the repo.

**One database.** The hosted API and the dashboard use the same Supabase
Postgres. The API runs `apps/api/migrations` there at boot and the dashboard's
key routes write to the API's own `api_keys` table. There is no second
Postgres and no key sync.

---

## 1. Create the Supabase project — **you** (done)

1. Create a project at https://supabase.com/dashboard (region close to the
   Vercel deployment; the Micro compute tier is enough to start).
2. From **Project Settings → API** copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **secret / service_role** key → `SUPABASE_SECRET_KEY`
3. From the **Connect** button at the top of the dashboard copy the
   **Session pooler** string (port 5432, host `aws-…pooler.supabase.com`,
   user `postgres.<ref>`) → `DATABASE_URL` for the API. Not the transaction
   pooler on 6543 (the job queue's `FOR UPDATE SKIP LOCKED` and the monitor
   claims need session state), and not the "direct connection" host, which is
   IPv6-only and unreachable from most hosts and home networks.

The dashboard treats Supabase as absent unless both of the first two are set
(`apps/dashboard/lib/supabase/server.ts`); `/api/app/keys` then answers 503 and
the keys page falls back to the instance/ephemeral flow.

## 2. Apply the schema (done)

Fresh project, one shot: open the SQL editor and run `supabase/schema.sql`. It
contains the API's eight migrations, the hosted ones, and the
`schema_migrations` rows the API's boot runner expects, so the API starts with
nothing to apply.

Anything later goes in as a new file under `supabase/migrations/`, applied
with the CLI (the repo is linked; `supabase/.temp/` holds the link and is
gitignored, so a fresh clone runs `supabase link --project-ref gytknetqttkdmkhmysbm` once):

```bash
supabase db push
node supabase/build-schema.mjs                          # keep schema.sql current
supabase gen types typescript --linked --schema public > apps/dashboard/lib/supabase/database.types.ts
```

`migration repair --status applied 0001 0002` was run once after schema.sql, so
`db push` only sees files newer than 0002.

API-side schema changes stay in `apps/api/migrations/` and apply at boot as
they always have; rerun the generator afterwards so `schema.sql` includes them.

## 3. Connect Clerk — **you**

1. **Supabase → Authentication → Sign In / Providers → Third-party → Clerk**:
   add the Clerk domain. **Clerk → Integrations → Supabase**: enable, so
   session tokens carry `role: "authenticated"`. RLS reads the Clerk user id
   from the token's `sub`.
2. **Clerk → Webhooks**: endpoint `https://helixapi-dev.vercel.app/api/webhooks/clerk`,
   events `user.created`, `user.updated`, `user.deleted`; copy the signing
   secret → `CLERK_WEBHOOK_SIGNING_SECRET`. This is what creates the
   `profiles` row a key hangs off.

## 4. Deploy `apps/extract`

Dockerfile: `apps/extract/Dockerfile` (python:3.12-slim). Any container host works.

| Env | Value |
|---|---|
| `HELIX_LLM_PROVIDER` | `openai` (or anthropic / gemini / openrouter) |
| `OPENAI_API_KEY` etc. | the operator key, if the instance should have a default — callers' own keys are forwarded per request and need nothing here |

Health check: `GET /health` returns `llm_configured`.

**`apps/extract` and `apps/api` deploy together, not independently.** A feature
that adds a route to one and calls it from the other — `POST /v1/convert`, since
removed, was the first example — fails in a specific, misleading way if only `apps/api` is
redeployed: the API answers `service_unavailable` with detail `"Not Found"`,
which reads like extract is down rather than merely out of date. Locally this
also bites through `uvicorn`'s dev server, which does not hot-reload new
routes the way `apps/api`'s `tsx watch` does — a code change to
`helix_extract/main.py` needs an actual restart, not just a saved file.
Redeploy or restart both services together whenever either side of the
`apps/api` ↔ `apps/extract` contract changes.

## 5. Deploy `apps/api`

Dockerfile: `apps/api/Dockerfile`.

| Env | Notes |
|---|---|
| `DATABASE_URL` | the Supabase Session-pooler string from step 1 |
| `HELIX_BOOTSTRAP_KEY` | the first API key; without it every request is rejected |
| `HELIX_ENCRYPTION_KEY` | 32 bytes hex/base64. Set it explicitly in production so rotating the bootstrap key does not invalidate stored provider keys |
| `HELIX_INTERNAL_ADMIN_TOKEN` | gates `/settings` and `/internal/*`. Unset means neither router is registered |
| `HELIX_EXTRACT_URL` | the step-4 deployment |
| `HELIX_FETCH_URL` | optional; the Rust tier. Unset degrades to the other tiers |
| `HELIX_CORS_ORIGINS` | must include `https://helixapi-dev.vercel.app` |
| `HELIX_PUBLIC_URL` | the API's own public URL; live-view links are built from it |
| `HELIX_MULTI_TENANT` | **set to `1` for the hosted deployment.** Scopes jobs to the API key that created them and withholds the instance-wide key and usage routes. Unset means the single-operator model, where every key on the instance can read and revoke every other — correct for self-host, a cross-tenant hole when several people share one instance |

Boot log should show every migration `skipped` (schema.sql seeded them) or,
on a project that skipped step 2, all eight `applied` — then run
`supabase db push` for the hosted files.

## 6. Point Vercel at everything — **you**

```bash
vercel env add HELIX_HOSTED_API_URL production        # https://<api-host>
vercel env add NEXT_PUBLIC_HELIX_API_URL production   # same value
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add SUPABASE_SECRET_KEY production
vercel env add CLERK_WEBHOOK_SIGNING_SECRET production
vercel --prod --yes
```

`NEXT_PUBLIC_HELIX_API_URL` is baked into the generated skill markdown that
the CLI and agents consume; a wrong value hands people a base URL that does
not work.

## 7. Verify, in this order

```bash
curl -sI https://<api-host>/v1/health                           # API is up
curl -s https://<extract-host>/health | jq .llm_configured      # provider key landed
curl -s -H "Authorization: Bearer <bootstrap>" \
     https://<api-host>/v1/providers                            # DB + auth path
```

Then in the browser: sign in, open **Keys**, create a key, and

```bash
curl -s -H "Authorization: Bearer helix-…" https://<api-host>/v1/usage
```

That call succeeding is the whole point of the one-database model: the row
the dashboard inserted is the row the API authenticated. Finish with
**Settings → Providers**, a real provider key, and one Agent request — the
only step that exercises the live LLM path end to end.

Confirm the tenant boundary is on, too. With `HELIX_MULTI_TENANT=1` the
instance-wide routes are not served; a 200 here means the variable did not
reach the API and every tenant can still list and revoke every other's keys:

```bash
# both must answer 404
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer helix-…" https://<api-host>/v1/keys
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer helix-…" https://<api-host>/v1/usage/all
```

---

## Known-unfinished before this is production

- **Clerk is on dev keys.** Production keys and a configured domain are needed,
  or sign-in breaks on the real hostname.
- **`HELIX_ENCRYPTION_KEY` rotation** re-encrypts stored provider keys through
  `POST /settings/encryption-key/rotate`, but the process keeps the old key in
  memory until restarted. Rotate, set the new value, then restart.
- **Schema verified on Postgres 18 without pgvector, not on Supabase itself.**
  `supabase/schema.sql` applied cleanly to a scratch cluster and RLS was
  probed there; the pgvector `chunks` block was parsed, not executed.
- **The self-host static export does not build on an exFAT checkout** — webpack
  raises `EISDIR` on `readlink`. Copy to NTFS to build.
