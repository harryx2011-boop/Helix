# Helix

A self-hostable, BYOK frontier utility hub — scrape · parse · convert · search · crawl · interact · monitor — with a hosted app. Three runtimes behind one HTTP surface.

**`context.md` is canonical.** Read it at session start; update it after features, schema changes, version bumps, and layout refactors. This file is the entry point only — it holds what is true across every turn, not rolling status. Per-version history lives in git log.

## Read before you act

| Need | Doc |
|---|---|
| What the project is, current state, conventions | `context.md` |
| Plan of record — site, app, auth, API catalog, phases | `WEBSITE.md` (84 decisions) |
| System design and principles | `ARCHITECTURE.md` |
| Tokens, character-animation motif | `DESIGN.md` |
| Build state by milestone | `MILESTONES.md` |
| Wire contract | `openapi.yaml` |
| In-flight work | `TODO.md`, `HANDOFF.md` |
| Sub-surface contracts | `CHECKS-CONTRACT.md`, `CONVERTER-CONTRACT.md`, `VULCAN-CONTRACT.md` |

Standing facts (deployment, verified runtime recipes, known gotchas, dead decisions) are printed at session start from
`C:/Users/harry/.claude/projects/e--Helix/memory/STANDING.md`. Trust it, but verify any claim about a file or flag still holding before acting on it.

## Search

**Graphify first.** `graphify-out/` is the primary search path — locate the node, then read the narrow range it points at. Read/Grep/Glob are fallbacks, and falling back requires saying why. Regenerate the graph after structural changes (files added/renamed/moved, a refactor touching 3+ files); `--update`'s prune leaves ghost nodes, so check counts after.

## Layout and ports

- `apps/dashboard` — one Next.js app: marketing (light), Clerk auth, onboarding, `/app` (dark). **Port 3400.** `HELIX_HOSTED=1` selects hosted mode; default is the self-host static export.
- `apps/api` — Fastify, Playwright pool, jobs. **Port 7400.** Routes mount under a `/v1` prefix; `/settings*` and `/internal/keys` mount outside it, on the admin-token boundary.
- `apps/fetch` — Rust, TLS identity. **Port 7401.**
- `apps/extract` — Python, parsing/LLM/embeddings. **Port 7402.**
- Postgres **7432**. `packages/` — profiles, schema, sdk-ts, cli (`@helix/cli`).

Converter is a route group at `/convert` inside the dashboard, not a standalone app. Vulcan and Checks are dashboard-only surfaces with no `apps/api` route — correctly absent from `openapi.yaml`. `/app/vulcan` is local-only.

## Hard constraints

- **E: is exFAT.** No symlinks: pnpm needs `node-linker=hoisted` — never remove `.npmrc`. `readlink` returns EISDIR on a regular file here, which is fatal to webpack, so **any `next build` on E: dies**. To build, robocopy to C: and build there. Dev server is webpack only — Turbopack panics in this hoisted exFAT monorepo; do not retry without moving to NTFS.
- **Writes to this drive can silently fail.** A heredoc that reports success, and even verifies on an immediate re-read, may leave nothing on disk — observed on this repo root 2026-09-10. After writing any file here, verify by reading the content back in a later, separate command, not by trusting the write's own exit code.
- **pnpm is not on the bash PATH** — use `corepack pnpm`.
- **`supabase/schema.sql` is generated** — run `node supabase/build-schema.mjs` after any migration. Reseeding and any destructive DB action on the shared Supabase project needs owner approval.
- **Never soften the grounding check** to raise enrich yield. A citation that fails verification is the control working.
- **A fingerprint perturbation seed must never be derivable from public data.** Keyed HMAC only — seeding from a public id lets a tracker invert the mask and read the true hardware hash.
- **Claims guard** (`WEBSITE.md` §11) applies to every user-facing string. The site copy never states counts.

## Versioning

SemVer; currently **1.23.1** in the root `package.json` — the one source of truth. Mirror the product version into `apps/api`, `apps/dashboard` and `openapi.yaml` **in the same commit** — `openapi.yaml` was missed for five releases and sat at 1.17.0. `packages/sdk-ts`, `packages/cli`, `apps/extract` (pyproject + `__init__.py`) and `apps/fetch` (Cargo.toml) carry their **own** lines, bumped only when that package changes. Grep the old string before calling a bump done; tag `v<version>`, never moved.

## Working rules

- **Parallelize by default.** Independent reads, greps, edits, and subagent dispatches go out in one message. Serialize only on real data dependencies.
- **Surgical edits.** Fix the broken section; never regenerate untouched code. Every changed line traces to the request.
- **Stage by name** (`git add path/to/file`, not `-A`), commit to `main`, **no AI co-author trailer**.
- Tokens: marketing = Firecrawl-structured light theme in violet; app = `DESIGN.md` dark. Fonts Geist + Geist Mono; radii pill/6px/8px; weights 400/450/500 only.

## Design skills

`.claude/rules/always-on-skills.md` adds the project's design-skill reads and the pre-commit review order for any landing-page change. It applies on every UI turn.
