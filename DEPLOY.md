# Deploying the hosted backend

The dashboard is live at `https://helixapi-dev.vercel.app` with nothing behind
it: no Supabase project, and neither `apps/api` nor `apps/extract` is deployed.
Keys, playground, Agent and Providers therefore work locally and nowhere else.

This is the sequence that changes that. Steps marked **you** need credentials or
an account only you have; the rest is in the repo.

**One database.** The hosted API, the dashboard and Persona all use the same
Supabase Postgres. The API runs `apps/api/migrations` there at boot; the
dashboard's key routes write to the API's own `api_keys` table; Persona's
tables sit beside them. There is no second Postgres and no key sync.

---

## 1. Create the Supabase project — **you**

1. Create a project at https://supabase.com/dashboard (region close to the
   Vercel deployment; the Micro compute tier is enough to start).
2. From **Project Settings → API** copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **secret / service_role** key → `SUPABASE_SECRET_KEY`
3. From **Project Settings → Database** copy the **direct connection** string
   (port 5432, not the transaction pooler on 6543 — the job queue's
   `FOR UPDATE SKIP LOCKED` and the monitor claims need session state)
   → `DATABASE_URL` for the API.

The dashboard treats Supabase as absent unless both of the first two are set
(`apps/dashboard/lib/supabase/server.ts`); `/api/app/keys` then answers 503 and
the keys page falls back to the instance/ephemeral flow.

## 2. Apply the schema

Fresh project, one shot: open the SQL editor and run `supabase/schema.sql`. It
contains the API's eight migrations, the hosted ones, and the
`schema_migrations` rows the API's boot runner expects, so the API starts with
nothing to apply.

Anything later goes in as a new file under `supabase/migrations/`, applied
with the CLI:

```bash
supabase link --project-ref <ref>
supabase migration repair --status applied 0001 0002   # once, after schema.sql
supabase db push
node supabase/build-schema.mjs                          # keep schema.sql current
```

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
3. Persona (`persona-ai.vercel.app`) uses the **same** Clerk application; it
   gets its own publishable/secret keys from that application and needs no
   second webhook.

## 4. Deploy `apps/extract`

Dockerfile: `apps/extract/Dockerfile` (python:3.12-slim). Any container host works.

| Env | Value |
|---|---|
| `HELIX_LLM_PROVIDER` | `openai` (or anthropic / gemini / openrouter) |
| `OPENAI_API_KEY` etc. | the operator key, if the instance should have a default — callers' own keys are forwarded per request and need nothing here |

Health check: `GET /health` returns `llm_configured`.

## 5. Deploy `apps/api`

Dockerfile: `apps/api/Dockerfile`.

| Env | Notes |
|---|---|
| `DATABASE_URL` | the Supabase direct connection string from step 1 |
| `HELIX_BOOTSTRAP_KEY` | the first API key; without it every request is rejected |
| `HELIX_ENCRYPTION_KEY` | 32 bytes hex/base64. Set it explicitly in production so rotating the bootstrap key does not invalidate stored provider keys |
| `HELIX_INTERNAL_ADMIN_TOKEN` | gates `/settings` and `/internal/*`. Unset means neither router is registered |
| `HELIX_EXTRACT_URL` | the step-4 deployment |
| `HELIX_FETCH_URL` | optional; the Rust tier. Unset degrades to the other tiers |
| `HELIX_CORS_ORIGINS` | must include `https://helixapi-dev.vercel.app` and `https://persona-ai.vercel.app` |
| `HELIX_PUBLIC_URL` | the API's own public URL; live-view links are built from it |

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
curl -s -H "Authorization: Bearer helix-…" https://<api-host>/v1/keys
```

That call succeeding is the whole point of the one-database model: the row
the dashboard inserted is the row the API authenticated. Finish with
**Settings → Providers**, a real provider key, and one Agent request — the
only step that exercises the live LLM path end to end.

---

## Known-unfinished before this is production

- **Clerk is on dev keys.** Production keys and a configured domain are needed,
  or sign-in breaks on the real hostname. Cross-site SSO with Persona needs
  satellite domains on a production instance.
- **`HELIX_ENCRYPTION_KEY` rotation** re-encrypts stored provider keys through
  `POST /settings/encryption-key/rotate`, but the process keeps the old key in
  memory until restarted. Rotate, set the new value, then restart.
- **Schema verified on Postgres 18 without pgvector, not on Supabase itself.**
  `supabase/schema.sql` applied cleanly to a scratch cluster and RLS was
  probed there; the pgvector `chunks` block was parsed, not executed.
- **The self-host static export does not build on an exFAT checkout** — webpack
  raises `EISDIR` on `readlink`. Copy to NTFS to build.
