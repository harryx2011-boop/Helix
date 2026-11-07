# Helix

A self-hostable, BYOK frontier utility hub — scrape · parse · search · crawl · interact · monitor — run on your own Windows PC and opened in your browser (a gated localhost app). Three runtimes behind one HTTP surface.

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
| Sub-surface contracts | `CHECKS-CONTRACT.md` |

Standing facts (deployment, verified runtime recipes, known gotchas, dead decisions) are printed at session start from
`C:/Users/harry/.claude/projects/d--Helix/memory/MEMORY.md`. Trust it, but verify any claim about a file or flag still holding before acting on it.

## Search

**Helix is also the tool you use.** The API's own MCP surface (`mcp__helix__helix_*`, user-scope server `helix` at `http://127.0.0.1:7400/mcp`) is how this and every other session reads the live web; `~/.claude/hooks/helix-ensure.js` starts the local stack. A change to `openapi.yaml` or `apps/api/src/mcp/` changes those tools, so run `apps/api/src/mcp/tools.test.ts` and `apps/dashboard/lib/mcp-tool-names.test.ts` after either. A new `operationId` also fails `packages/sdk-ts` codegen until it has a row in `codegen/methods.ts` or an entry in `NOT_IN_SDK`; the root `pnpm test` runs every package and catches it. `HELIX_MCP_TOOLS` names the tools exposed; the hook sets the 29-tool core.

**Synapse first.** For code structure (callers, imports, impact) query `synapse-graph` (via `mcp__aether__call_tool`), then read the narrow range it points at. Read/Grep/Glob are fallbacks, and falling back requires saying why.

## The browser app (`apps/desktop`)

Helix runs as a localhost browser app; the Electron shell is gone. `corepack pnpm --filter @helix/desktop web` (after `web:ui` once, or `web:dev` for a `next dev` UI) starts the API (7410), extract (7412) and scrape (7413) as before, then serves the UI and API on **127.0.0.1:3410** behind a gate (`apps/desktop/src/web/gate.ts`).

- The gate refuses a wrong Host (DNS rebinding), a foreign Origin, cross-site fetch metadata and any request without the per-launch token. The token arrives once as `/?t=<token>` and becomes an HttpOnly SameSite=Strict cookie. Never bind another interface and never skip the gate.
- The gate injects `window.helixDesktop` (API key, admin token, dictation) into HTML replies, as the Electron preload used to. Only a request that passed the gate gets it.
- Data stays in `%APPDATA%\Helix\{data,runtime}`. The launcher reads the stored credentials read-only: the API key also derives the encryption key for provider keys in the database, so a new key would orphan them. Never rewrite or move `credentials.json`. The launcher's own logs and pid files go to `%APPDATA%\Helix\web\`.
- Builds and installs go on C: (`C:/Builds/helix`) through the resource gateway, not on D:.

## Layout and ports

- `apps/dashboard` — one Next.js app: marketing and docs (light), `/app` (dark), `/checks` in `app/(tools)` (light, local app only). No accounts, no sign-in: Clerk, Supabase, onboarding and `app/api/**` left in `DESKTOP-PLAN.md` Phase 2b. The website keeps marketing; `/app` ships only in the local browser app (`apps/desktop`). **Port 3400.** `HELIX_HOSTED=1` selects the website build (Vercel, server output, `/app` redirected to `/download`); default is the self-host static export.
- `apps/api` — Fastify, Playwright pool, jobs. **Port 7400.** Routes mount under a `/v1` prefix; `/settings*` and `/internal/keys` mount outside it, on the admin-token boundary.
- `apps/scrape` — Python (Scrapling), fetch and TLS identity; replaced the Rust `apps/fetch` in v3. **Port 7403** (local app 7413).
- `apps/extract` — Python, parsing/LLM/embeddings. **Port 7402.**
- Postgres **7432**. `packages/` — profiles, schema, sdk-ts, cli (`@helix/cli`).

The Converter left Helix on 2026-09-25: file conversion is Sparky's (`D:\sparky\sparky`), and `/convert`, `POST /v1/convert` and `helix_convert` are gone. Checks is a dashboard-only surface with no `apps/api` route — correctly absent from `openapi.yaml`. Vulcan left Helix on 2026-09-25 and lives at `D:\vulcan-scratchpad`.

## Hard constraints

- **D: is NTFS** (the repo moved off exFAT E:). `readlink` on a regular file returns EINVAL here, re-tested 2026-11-01; the old EISDIR build failure was exFAT-only. Keep `.npmrc` `node-linker=hoisted`. The dev server stays webpack only: Turbopack panicked in this hoisted monorepo and has not been retried on NTFS.
- **Writes to this drive can silently fail.** A heredoc that reports success, and even verifies on an immediate re-read, may leave nothing on disk — observed on this repo root 2026-09-10. After writing any file here, verify by reading the content back in a later, separate command, not by trusting the write's own exit code.
- **pnpm is not on the bash PATH** — use `corepack pnpm`.
- **`supabase/schema.sql` is generated** — run `node supabase/build-schema.mjs` after any migration. Reseeding and any destructive DB action on the shared Supabase project needs owner approval.
- **Never soften the grounding check** to raise enrich yield. A citation that fails verification is the control working.
- **A fingerprint perturbation seed must never be derivable from public data.** Keyed HMAC only — seeding from a public id lets a tracker invert the mask and read the true hardware hash.
- **Claims guard** (`WEBSITE.md` §11) applies to every user-facing string. The site copy never states counts.

## Versioning

SemVer; currently **2.3.2** in the root `package.json` — the one source of truth. Mirror the product version into `apps/api`, `apps/dashboard`, `apps/desktop` and `openapi.yaml` **in the same commit** — `openapi.yaml` was missed for five releases and sat at 1.17.0. `packages/sdk-ts`, `packages/cli`, `apps/extract` (pyproject + `__init__.py`) and `apps/fetch` (Cargo.toml) carry their **own** lines, bumped only when that package changes. Grep the old string before calling a bump done; tag `v<version>`, never moved. **Every bump also adds the newest entry to `apps/dashboard/lib/changelog.ts` in the same commit;** `pnpm --filter @helix/dashboard check:changelog` fails when a tag or manifest version is missing.

## Working rules

- **Typecheck is TS 7 native (2026-10-03).** `pnpm -r typecheck` runs the root devDependency `typescript-native` (alias of `typescript@^7`, the Go port) as `node ../../node_modules/typescript-native/bin/tsc`; the dashboard passes `--noUncheckedSideEffectImports false`. `typescript` stays 5.9 for `next build`, typescript-eslint and the `build` emits: TS 7 has no stable programmatic API until 7.1, so revisit then. Median of 7 runs of `pnpm -r typecheck`: cold 8954 ms before, 2177 ms after; warm 3706 ms before, 1186 ms after; both green. The hoisted linker links the higher version to the root `node_modules/.bin/tsc`, so a bare `tsc` is TS 7 here: the `build` scripts in `apps/api`, `packages/cli` and `packages/sdk-ts` call `node ../../node_modules/typescript/bin/tsc` to keep emitting with 5.9.
- Tokens: marketing and `/checks` = the Firecrawl-structured light violet `--m-*` theme under `data-surface="marketing"`; app = `DESIGN.md` dark. Fonts Geist + Geist Mono; radii pill/6px/8px; weights 400/450/500 only.

## Design skills

`.claude/rules/always-on-skills.md` adds the project's design-skill reads and the pre-commit review order for any landing-page change. It applies on every UI turn.

## Design

UI work reads `DESIGN-SYSTEM.md` and `TOKENS.md` first; no raw colour, size or easing outside `TOKENS.md` (format: `~/.claude/reference/design-system-files.md`).
