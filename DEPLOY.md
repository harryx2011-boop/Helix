# Deploying the hosted backend

The dashboard is already live at `https://helixapi-dev.vercel.app`, running on
stubs: no Supabase project exists, and neither `apps/api` nor `apps/extract` is
deployed. Keys, runs, playground, Agent and Providers therefore work locally
and nowhere else.

This is the sequence that changes that. Steps marked **you** need credentials or
an account only you have; the rest is already in the repo.

---

## 1. Create the Supabase project — **you**

Nothing here can be automated: it needs your Supabase account.

1. Create a project at https://supabase.com/dashboard (region close to the
   Vercel deployment).
2. From **Project Settings → API**, copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **service_role** key → `SUPABASE_SECRET_KEY`

The dashboard treats Supabase as absent unless *both* are set
(`apps/dashboard/lib/supabase/server.ts:23`), which is why the site currently
serves zeros rather than erroring.

## 2. Push the schema

`supabase/config.toml` is committed, so this works once the project exists:

```bash
supabase link --project-ref <ref>
supabase db push
```

That applies `supabase/migrations/0001_hosted_app.sql` (profiles, api_keys,
instances, runs, usage_daily) and `0002_github_connections.sql`.

**These are not the API's migrations.** `apps/api/migrations/*.sql` run against
the API's own Postgres at boot, from `migrate()`. Two separate databases with
two separate migration histories — do not cross them.

## 3. Deploy `apps/extract`

Dockerfile: `apps/extract/Dockerfile` (python:3.12-slim). Any container host works.

| Env | Value |
|---|---|
| `HELIX_LLM_PROVIDER` | `openai` (or anthropic / gemini / openrouter) |
| `OPENAI_API_KEY` etc. | the operator key, if the instance should have a default — callers' own keys are forwarded per request and need nothing here |

Health check: `GET /health` returns `llm_configured`, which is the fastest way
to tell whether a key landed.

## 4. Deploy `apps/api`

Dockerfile: `apps/api/Dockerfile`. Needs a Postgres of its own — **not** the
Supabase database.

| Env | Notes |
|---|---|
| `DATABASE_URL` | required; the API's own Postgres |
| `HELIX_BOOTSTRAP_KEY` | the first API key; without it every request is rejected |
| `HELIX_ENCRYPTION_KEY` | 32 bytes hex/base64. Unset derives from the bootstrap key — set it explicitly in production so rotating one does not silently invalidate stored provider keys |
| `HELIX_INTERNAL_ADMIN_TOKEN` | gates `/internal/*` and `/settings`. Unset means neither router is registered at all |
| `HELIX_EXTRACT_URL` | the step-3 deployment |
| `HELIX_FETCH_URL` | optional; the Rust tier. Unset degrades to the other tiers |
| `HELIX_CORS_ORIGINS` | must include `https://helixapi-dev.vercel.app`, or the browser blocks every call |
| `HELIX_PUBLIC_URL` | the API's own public URL; live-view links are built from it |

## 5. Point Vercel at the API — **you**

```bash
vercel env add HELIX_HOSTED_API_URL production      # https://<api-host>
vercel env add NEXT_PUBLIC_HELIX_API_URL production # same value
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add SUPABASE_SECRET_KEY production
vercel --prod --yes
```

Both matter, for different reasons:

- `HELIX_HOSTED_API_URL` is what the server-side proxies call — playground,
  jobs, agent, providers, and `lib/profiles.ts`.
- `NEXT_PUBLIC_HELIX_API_URL` is the base URL shown to users in
  **Settings → Advanced** and, more consequentially, baked into the generated
  skill markdown (`/api/app/skill`) that the CLI and agents consume. A wrong
  value there hands people a base URL that does not work.

Both are unset today, so both fall back to `http://localhost:7400` — which is
exactly why the deployed site reaches nothing.

## 6. Verify, in this order

Each step fails distinctly, so run them in sequence rather than together:

```bash
curl -sI https://<api-host>/v1/health                      # API is up
curl -s https://<extract-host>/health | jq .llm_configured # provider key landed
curl -s -H "Authorization: Bearer <bootstrap>" \
     https://<api-host>/v1/providers                       # DB + auth path
```

Then in the browser: sign in, open **Settings → Providers**, save a real
provider key, and run one Agent request. That last step is the only thing that
exercises the live LLM path end to end — it has never been run with a valid
key, only with a deliberately invalid one to prove the plumbing reaches the
provider.

---

## Known-unfinished before this is production

- **Clerk is on dev keys.** Production keys and a configured domain are needed,
  or sign-in breaks on the real hostname.
- **`HELIX_ENCRYPTION_KEY` rotation** re-encrypts stored provider keys through
  `POST /settings/encryption-key/rotate`, but the process keeps the old key in
  memory until restarted. Rotate, set the new value, then restart.
- **The self-host static export does not build on an exFAT checkout** — webpack
  raises `EISDIR` on `app/api/webhooks/clerk/route.ts`. Unrelated to hosted
  deployment, but it blocks producing the self-host bundle from this machine.
