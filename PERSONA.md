# Persona — plan of record

> A sub-brand under Helix at **persona-helix.vercel.app**: a searchable library of role-specific system prompts, each with setup guides, a live templating wizard and an in-browser editor with export. Free, anonymous by default, and a Helix account (Clerk) unlocks cloud-saved forks and shareable links. This file is the plan; the PRD it descends from is `research/persona/persona-prd-final.md`.

**2026-09-05: superseded by `PERSONA-REVAMP.md` for everything after Phase 3.** Phase 4 (accounts) is dead by decision, not deferred; §3's "anonymous first, account second" and §7's rows 4–5 no longer apply.

Decided 2026-09-02. Status: **Phases 0–3 shipped the same day** (schema, dashboard keys, the Supabase project, `apps/persona` with landing, library, role pages, wizard, editor and export, deployed to persona-helix.vercel.app); Phase 4 (accounts) and 5 open. **2026-09-03:** the library is 36 roles and 112 personas, each with an LLM setup guide; `content/INDEX.md` indexes them for agent dispatch (`~/.claude/rules/persona-agents.md`).

---

## 1. What Persona is, in one paragraph

Eleven roles (Support Chat, Support Email, Customer Success, Sales, Marketing, Product, Developer Relations, Data Analytics, Security, FinOps, HR), each with one or more competing personas, each persona versioned, each with platform tabs (Email · Chat · Code · SQL · Python …) that swap the setup guide and the code panel. A deterministic engine finds every `{{PLACEHOLDER}}` in the chosen prompt and walks the visitor through filling it, one question at a time, substituting live. The result can be edited in a block editor, exported as `.md` / `.txt` / `.json` / `.pdf`, forked, favourited and shared by link. Search is keyword and filter (department · platform · tone) in v1; semantic search over embeddings is the stretch goal.

Persona's first three seconds sell **breadth**: the library is the hook, not speed and not trust badges.

## 2. Where it lives

| | Decision | Why |
|---|---|---|
| Code | `apps/persona` in this monorepo (shipped 2026-09-02) | Shares the Clerk application, the Supabase project, `packages/`, lint/tsc config and the deploy habit. A separate repo would mean a second copy of the auth glue and the profile row. |
| Stack | Next.js 15 · Tailwind · shadcn/ui · framer-motion (role pill, hero) · CSS for sidebar, progress bars, skeletons · `lucide-react` only | As the PRD. No company favicons anywhere: platforms are generic (`Mail`, `MessageCircle`, `Terminal`, `Shield`). |
| Port | **4200** (the block Noted freed); no backend of its own | Supabase is the backend. Add it to the global port table when the app is scaffolded. |
| Vercel | New project `persona-ai`, Root Directory `apps/persona`, `outputFileTracingRoot` = repo root (same trap Helix hit) | One repo, two Vercel projects, each watching its own root dir. |
| Rendering | Role and persona pages are static/ISR (`generateStaticParams` over the catalog, `revalidate` after a seed); app surfaces (editor, wizard, settings) are client components | SEO on every role page was a hard requirement. |
| Visual system | Light, Inter (600 headlines / 500 pill text) + JetBrains Mono, black primary, blue `#2F6FE4` **only** for actions, 11 role tints for content colour-coding, Cortex-style dot grid with a soft blue radial glow on the hero, wizard cards and editor backdrop only | Deliberately not Helix's violet marketing theme: a sibling brand, not a sub-page. `research/persona/role-pill.tsx` is the drafted pill component. |

## 3. Data: one database, one identity

Persona reads and writes the **same Supabase project** the hosted Helix API and dashboard use. Schema: `supabase/migrations/0002_persona.sql` (catalog + user data + RLS + the 11-role seed); full one-shot file `supabase/schema.sql`.

```
profiles ─┬─ api_keys (Helix)            ← 0001_hosted_identity.sql
          ├─ persona_forks
          ├─ persona_favorites
          ├─ persona_template_values      ← 0002_persona.sql
          └─ persona_shares (profile_id nullable: anonymous shares allowed)

persona_roles ─ personas ─┬─ persona_versions (body_md, placeholders[], changelog)
                          └─ persona_setup_guides (tab, body_md, config_keys)
```

Rules the schema enforces:

- **Catalog is public-read, never client-written.** Seeded by a script with the service role; there is no authoring UI in v1.
- **User rows are owner-only**, `USING` and `WITH CHECK`, keyed through `current_profile_id()` from the Clerk `sub` claim. An update cannot hand a row to another profile.
- **Shares are resolved server-side only.** A browser can list and delete its own shares but cannot select by token, so tokens cannot be enumerated. The share is a frozen copy of body + values at share time.
- **`personas.search`** is a stored `tsvector` with a GIN index: keyword search costs one query. The semantic stretch adds `embedding vector(384)` on `persona_versions` via the same pgvector Supabase already ships.
- **One default persona per role** (partial unique index), so a role page always has something to open on.

### Anonymous first, account second

Everything works signed out: forks, favourites, template values and the wizard's answers live in `localStorage` (`persona.*` keys) indefinitely. Signing in with the shared Clerk application:

1. Creates nothing new: the `profiles` row already exists from Helix's Clerk webhook (`user.created`), or is created by the same webhook on first sign-in to either site.
2. Merges local state up: local forks are inserted, local favourites unioned, template values upserted, then the local copy is marked synced. Conflicts (same fork edited on two devices) resolve last-write-wins on `updated_at`; v1 does not merge bodies.
3. Reads through a Supabase client that presents the Clerk session token (`accessToken: () => session.getToken()`), so RLS applies in the browser and the service role never leaves the server.

## 4. Auth: Clerk, shared with Helix

- **Same Clerk application** as `helixapi-dev`: one user pool, one webhook, one `profiles` table. Persona gets its own publishable/secret key pair from that application's dashboard (same instance, second host).
- **Supabase third-party auth**: in the Supabase dashboard enable Clerk under Authentication → Sign In / Providers → Third-party; in Clerk enable the Supabase integration so session tokens carry `role: "authenticated"`. `current_clerk_user_id()` reads `sub`; nothing else in the token is trusted.
- **Cross-site single sign-on** (signed in on Helix ⇒ signed in on Persona) needs Clerk **satellite domains**, which need a production Clerk instance on a real domain (`persona.helix.dev` under `helix.dev`, or equivalent). On `*.vercel.app` with dev keys the two sites share accounts but each asks you to sign in. Ship without SSO; add it when the domains exist.
- **Helix API keys inside Persona**: the account page lists the user's keys read-only through RLS (`api_keys` select policy; `key_hash` is not grantable to browsers). Minting stays on the Helix dashboard. Persona's optional "Try this persona" (Phase 5) runs the compiled prompt through the hosted Helix API with the user's key and their own BYOK provider, and is off until that API is deployed.

## 5. Content

Source: the 27 files in `research/persona/content/` (11 personas, 12 setup guides, the configuration template and the integration wizard). All 11 personas are rewritten to one structure before launch: **Core purpose · Voice & tone · Workflows (trigger/context/action) · Security & abuse guardrails · Tool & knowledge rules · Escalation triggers**, in the imperative, second person, no em-dash runs, no vague filler.

A seed script `supabase/seed/persona.mts` (service role) reads `content/personas/<role>/<persona>.md` + `guides/<tab>.md` and upserts personas, versions and guides. Placeholders are derived from the body: every `{{TOKEN}}`, in first-appearance order, with a label, hint and default drawn from the guide's `KEY = "value"` block (`COMPANY_NAME`, `SUPPORT_EMAIL`, `HELP_CENTER_URL`, `BUG_REPORT_URL`, `FEATURE_REQUEST_URL`, `HANDOFF_QUEUE_NAME`, `MAX_TROUBLESHOOTING_STEPS`, `TRANSACTION_THRESHOLD`, …). The wizard's `Q1.1_COMPANY_NAME`-style tokens are normalised to those keys so one saved answer fills every persona.

**Open item 4, answered.** The four Support Agent files are not four personas:

| File | Verdict |
|---|---|
| `Persona_Support_Agent_v2.md` | **Support (Chat) — default.** The most complete: named guardrails (prompt extraction, code/auth abuse, ticket flooding), escalation triggers. |
| `Persona_Support_Agent.md` (79 lines) | **Support (Chat) — "Detailed" persona.** Same workflows plus Response Formatting Specs; keep as the second, more prescriptive style. |
| `Persona - Support Agent.md` (48 lines) | Draft of v2 (subset). Discard. |
| `Persona - Support Agent 3cf5….md` | Earliest draft, different section names. Discard. |
| `Persona - Support Agent (Email).md` | **Support (Email)** — its own role, as the PRD says. |

## 6. Screens (from the PRD, unchanged)

- **Landing `/`**: headline with the animated role pill (timer-driven, 1.8 s, JetBrains Mono, tinted dot + background per role); CTAs "Browse the library" (black) and "See how it works" (ghost); the looping cursor-and-typing search demo in a browser-chrome card; a flat browser-window mockup that is a real `<iframe src="/roles">`; the template-fill wizard card with the striped blue 4-step progress bar; skeleton shimmer on the browse grid for ~2 s.
- **App shell**: left sidebar, open by default, resizable within a clamped range, collapses to a 64 px rail by toggle or by dragging past the threshold; tabs Search (input + chip filters: Department · Platform · Tone) and Settings (theme, API key field for the wizard's model step, saved forks list).
- **`/roles`** browse grid; **`/roles/[slug]`** role page with persona dropdown, platform tabs driving a live code/preview panel, version history, burger menu (Open in editor · Download · Copy · Duplicate · Share · Favourite); **`/editor/[forkId]`** Notion-style block editor (bold, italic, heading, list as the floor), export to `.md` `.txt` `.json` `.pdf`; **`/s/[token]`** share landing (server-resolved).
- No suggestion-pill triads anywhere (global rule). No fake testimonials, no stats.

## 7. Phases

| Phase | Scope | Owner | Done when |
|---|---|---|---|
| **0 — schema + keys** (shipped 2026-09-02) | `supabase/migrations/0001`, `0002`, `schema.sql` + generator; dashboard mints real keys into the shared `api_keys`; Clerk webhook → `profiles`; pgvector migration bug fixed | Claude | Applied to a scratch Postgres; RLS probed; API boot path verified. **Not yet run on a real Supabase project.** |
| **1 — the project** | Create the Supabase project; paste `schema.sql`; enable Clerk third-party auth; set Vercel env (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`); point the hosted API's `DATABASE_URL` at it (DEPLOY.md) | Harry (accounts), Claude (verification) | A key created on `/app/keys` authenticates a `curl` against the hosted API. |
| **2 — catalog site** | `apps/persona` scaffold on 4200; landing (pill, search demo, iframe mockup, wizard card); `/roles`, `/roles/[slug]` static; sidebar search + filters; seed script + the 11 rewritten personas; Vercel project `persona-ai` | Claude | Every role page 200 at 1440/390, tsc + lint clean, `interface-review` → `review-animations` → tastemaker anti-slop → `ui-anti-vibe` checklist pass. |
| **3 — engine + editor** | Placeholder scanner, step-by-step wizard with the striped progress bar, live substitution, block editor, four export formats, localStorage persistence | Claude | A visitor fills Support (Chat) end to end and downloads a `.pdf` without signing in. |
| **4 — accounts** | Clerk on Persona; Supabase client with the session token; local→cloud merge; forks, favourites, template values, shares (`/s/[token]`, server route) | Claude | Two browsers, one account, same forks. **Schema unblocked 2026-09-03 (1.3.0), code not started.** |
| **5 — polish + stretch** | Version-history UI, "Try this persona" through the hosted Helix API, semantic search (`persona_versions.embedding`), satellite-domain SSO once domains exist | Claude / Harry | Each ships on its own. |

Phase 2 is the weekend build the PRD names; Phases 3 and 4 are the second and third weekends.

### Phase 4's blocker, and the fix (2026-09-03, migration `0004_persona_sync.sql`)

§3's schema was written as if the browser knew catalog UUIDs. It does not. Persona's catalog is **markdown on disk**, read by `lib/catalog.ts`, so everything localStorage holds is keyed by **slug** — a fork records `roleSlug`/`personaSlug` and an integer `sourceVersion`, a favourite is the string `"support-chat/chat-v2"`. Against 0002, signing in would have had to translate every local row into a uuid before it could be inserted, and any row whose persona had been reseeded with a new id was silently unmergeable. Three concrete gaps, all closed:

| Gap | 0002 | 0004 |
|---|---|---|
| Fork origin | only `persona_id`/`source_version_id` uuids; `roleSlug`/`personaSlug` had nowhere to land | `role_slug`, `persona_slug` added beside the uuids — the uuid is the live link, the slugs are the durable record once the catalog row is gone |
| Fork version | `source_version_id uuid` vs a local integer | `source_version int` stored directly; the uuid stays an optional refinement |
| Favourites | primary key `(profile_id, persona_id)` — unwritable offline, and not idempotent on re-sync | rebuilt with primary key `(profile_id, role_slug, persona_slug)`, so a merge is a plain upsert |

Also fixed: `persona_template_values` had **no touch trigger**, so `updated_at` never moved off its insert default and the last-write-wins merge would have compared two equal timestamps forever.

**Settings stay local by decision.** Theme, sidebar width and collapse state are per-device UI preferences — syncing them would make a wide desktop sidebar narrow every phone. The wizard's model API key is deliberately not synced either: it is a provider secret, and Persona has no server-side encryption path for it the way `apps/api` has for `provider_keys`.

Still to write (the code half of Phase 4): `ClerkProvider` + `middleware.ts` in `apps/persona` (it has `@clerk/nextjs` as a dependency and zero imports today), a Supabase **browser** client presenting the Clerk session token (the dashboard has only the server/service-role one, so this is a new pattern, not a copy), and the merge itself. Sync hazards to respect: fork upserts are idempotent on the client-generated UUID, favourites need `on conflict do nothing`, and a second tab signing in with its own localStorage can double-insert unless the merge reads the remote set first.

## 8. Still open (need a human call)

1. Final logo from the 20 concepts in `research/persona/logos/`.
2. Copy voice for the persona rewrite beyond "consistent" (default if unanswered: the six-section structure in §5, second person, imperative).
3. Where the wizard launches from on a role page (default: a primary "Fill in the blanks" button beside the persona dropdown, plus the burger menu).
4. Editor toolbar ceiling (default: floor only; tables/embeds/code blocks deferred).

---

## Appendix — the hosted Helix side, decided in the same pass

**One database.** The 2026-08-29 removal of Supabase was right about the duplication and wrong about the remedy: the hosted API now uses the Supabase project as its `DATABASE_URL`, runs `apps/api/migrations` there at boot, and the dashboard's server routes insert into the API's own `api_keys` table with a `profile_id`. A key minted at `/app/keys` is valid on the next request, with no mirror, no `/internal/keys` sync and no second copy of runs or usage. RLS is on for all 24 tables (the API connects as owner and is unaffected); policies exist only where a signed-in browser should read directly (own profile, own keys minus `key_hash`, own jobs, own monitors, Persona's own rows).

**Migration order.** Fresh project: `supabase/schema.sql` once (it also seeds `schema_migrations`, so the API's boot runner finds nothing to do). Existing project: API boots first, then `supabase db push`. New hosted migrations regenerate `schema.sql` (`node supabase/build-schema.mjs`).

**The pgvector bug.** `001_init.sql`'s chunks block was syntactically broken and never reached — every environment so far lacked pgvector. Supabase has it, so the block would have failed the first boot. Fixed in place; `migrate.ts` tolerates the pre-fix checksum for that one file.
