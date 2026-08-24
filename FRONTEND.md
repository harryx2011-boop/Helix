# Helix — Frontend Plan

**Status:** design settled, build starting · **Date:** 23 August 2026

The frontend is a **dashboard**: the UI of a running Helix instance, served by the API itself. Not a marketing site. Someone who has just run `docker compose up` opens `localhost:7400` and this is what greets them.

Companion documents: [ARCHITECTURE.md](ARCHITECTURE.md) for the system it drives, [openapi.yaml](openapi.yaml) for the contract it calls, [research/10-site-ia.md](research/10-site-ia.md) for competitor structure.

---

## 1. What this is, and who it is for

**The audience is a self-hoster.** Someone who chose to run this rather than rent it, and who needs to know within thirty seconds that their instance is alive and working.

That single fact settles most of the design. No pricing page. No signup flow. No credit balance. No upgrade prompts. The person looking at this screen already owns the thing — the job is to make it legible, not to sell it to them again.

It also sets the tone. This should feel like something you run: a terminal, a control panel, an instrument. Not a SaaS console with a trial banner.

### What it is not

- Not a marketing site. That can come later and is a separate surface.
- Not multi-tenant. One instance, one operator, however many API keys they choose to mint.
- Not a hosted product. There is no account, because there is no service to have an account with.

---

## 2. The competitive read

From the IA teardown in `research/10-site-ia.md`, the finding that matters:

> **Firecrawl's self-host guide is buried several clicks into docs and absent from marketing navigation.** Steel.dev puts self-hosting on its homepage. For an open-source-core product this is undersold relative to peers.

Their site is built to convert a visitor into an account. Ours is built to confirm to an operator that their instance works. That is not a smaller ambition, it is a different one — and it is the half of the category nobody is serving well.

Two conventions worth adopting regardless:

- **The playground as proof.** Their homepage widget converts because it removes doubt. Ours does the same job locally, against the operator's own instance, with no gate at all.
- **LLM-readable docs.** Every page dual-served as `.md` with an `llms.txt` index. Now a category expectation for AI infrastructure, and cheap to provide.

One convention to reject: **the signup gate.** Their full playground requires an account. Ours cannot, because there is nobody to sign up to.

---

## 3. Decisions

| Decision | Choice | Why |
|---|---|---|
| Primary surface | Dashboard | The operator's instance UI, not a sales page |
| Framework | Next.js, App Router | Matches the other projects; static export suits serving from the API |
| Deployment | **Served by the API itself** | One container, one port. `docker compose up` yields API and UI together |
| Auth | **API key, stored locally** | No user table, no sessions. The key goes in `localStorage` and rides the `Authorization` header |
| Design system | Tailwind + shadcn/ui | Components you own outright, sensible defaults, fast to move in |
| Visual motif | **Character-based animation** | Text art that explains the fetch ladder rather than decorating around it |
| Palette | **White, black, purple** | Taken from the mark: `#8B5CF6`, `#5B21B6`, `#0B1220`. See [DESIGN.md](DESIGN.md) |
| Live demo | Yes, local | The playground *is* the demo, running against the operator's own instance |

### Serving from the API

Next.js builds to static output; Fastify serves it at `/`, with the API under `/v1`. Same origin, so no CORS configuration and no second port to explain.

The cost is that the dashboard cannot use server-side rendering or route handlers. For a client-side control panel talking to a local API, that costs nothing worth having.

### Auth, and its honest limit

The API has keys. It has no users, no sessions, no login. Inventing an account system for the dashboard would add a concept the API deliberately does not have.

So: paste your key, it lives in `localStorage`, every request carries it as a bearer token.

**The limit, stated plainly.** A key in `localStorage` is readable by any script running on that origin. For a tool bound to `127.0.0.1` on a machine you own, that is an acceptable trade. For an instance exposed to a network, it is not — and the dashboard should say so rather than let someone discover it later.

---

## 4. The four screens

### Playground — the screen that proves it works

**Split pane: request left, result right.** The convention every API playground uses, which means it needs no explanation.

All four endpoints, tabbed: `scrape`, `map`, `search`, `crawl`. Crawl is asynchronous and does not fit a screen built for immediate results, so submitting one hands off to Jobs rather than pretending to complete inline.

The result pane shows:

- Rendered markdown, and **raw JSON** behind a toggle — required by anyone integrating rather than browsing
- **The fetch ladder that was walked** — `plain → tls → chromium`, with the timing of each rung
- On failure, **an explanation and a next step**

That last point is the one worth dwelling on. Helix refuses to return a bot-challenge page as content; it returns a typed failure with the signals that fired. Most tools show a red box. This screen should name the reason, list the signals, and suggest the concrete next move — a higher tier, a different profile, a proxy. A product honest about failure should make that honesty visible rather than merely correct.

### Jobs — crawl monitoring

The screen an operator watches during a long crawl. Progress, pages completed, pages failed, live throughput. Per-page failures with their typed reasons, because "40 of 100 pages" is a question, not an answer.

Rejection counts belong here too — `off-site: 4,000` is the difference between "we crawled 12 pages" and "we crawled 12 pages and turned away four thousand". A silent cap reads as complete coverage.

Cancellation lives here, and must be honest that finished results survive it.

### Keys — create and revoke

Small and self-contained. Create a named key with a rate limit, see its prefix and last-used timestamp, revoke it.

One interaction carries real weight: **a new key is shown exactly once.** The screen must make that unmissable, because the alternative is someone closing a dialog and losing a credential that cannot be recovered.

### Health — why is nothing working

Every dependency with its status: Postgres, `helix-fetch`, `helix-extract`, the browser pool. Which BYOK providers are configured — LLM, embeddings, proxy, search — **without ever revealing key material**.

This is the screen someone opens when something is broken, so it should answer the question directly. "Extract service unreachable" beats a red dot.

---

## 5. The character-animation motif

The user's brief: text and character animations, in the spirit of what Firecrawl does. The direction taken here is that **the animation should explain the product's distinctive mechanic**, not decorate around it.

Helix escalates through four fetch tiers, moving up only on evidence of a block or missing content. No competitor surfaces this. An animation that makes the ladder legible is doing real work; a spinner made of Unicode is not.

Detailed specification — character sets, literal frame sequences, timings, tokens — is the visual designer's deliverable and lands in `DESIGN.md`. The constraints it works within:

- **Every animation communicates a state change.** Motion for its own sake gets cut.
- **`prefers-reduced-motion` is honoured absolutely.** A character animation that cannot be stilled is an accessibility failure, not a stylistic choice.
- **A dashboard is stared at for an hour.** Motion tolerance on a control panel is far lower than on a landing page, and the spec must be explicit about where animation is allowed at all.
- No purple gradients, no glow effects, no `hover:scale` beyond 1.05, no emoji decoration.

---

## 6. Structure

```
apps/dashboard/
├─ app/
│  ├─ layout.tsx              shell, theme, key gate
│  ├─ page.tsx                playground (the default screen)
│  ├─ jobs/page.tsx           crawl list
│  ├─ jobs/[id]/page.tsx      one crawl, live
│  ├─ keys/page.tsx           key management
│  └─ health/page.tsx         services and providers
├─ components/
│  ├─ ui/                     shadcn primitives
│  ├─ ladder/                 the fetch-ladder visualisation
│  ├─ ascii/                  character-animation components
│  └─ result/                 markdown, JSON, failure panes
├─ lib/
│  ├─ api.ts                  typed client, generated from openapi.yaml
│  ├─ auth.ts                 key storage and the localhost bypass question
│  └─ format.ts               durations, byte sizes, relative times
└─ next.config.ts             static export
```

The API client is **generated from `openapi.yaml`**, not hand-written. The spec is already the source of truth for three runtimes; making the dashboard a fourth consumer costs nothing and removes an entire class of drift.

---

## 7. Build order

| # | Step | Contains |
|---|---|---|
| **F0** DONE | Shell | Next.js 15, Tailwind, shadcn, static export, key gate, theme provider, top nav |
| **F1** DONE | Playground | Split pane, scrape form, markdown and JSON panes, fetch ladder, typed failure panel |
| **F2** | Health | Service status, provider configuration, browser pool stats |
| **F3** | Keys | List, create with one-time reveal, revoke |
| **F4** | Jobs | List, detail, live progress, failures, rejections, cancel |
| **F5** | Remaining endpoints | Map, search and crawl tabs in the playground |
| **F6** | Motif | Character animations per `DESIGN.md`, with reduced-motion paths |
| **F7** | Polish | Empty states, keyboard shortcuts, responsive behaviour, accessibility pass |

F1 first, because a dashboard whose playground works is already useful and one whose playground does not is not a dashboard.

### Where F0 and F1 actually stand

Built and verified: typecheck clean, lint clean, `next build` produces a working static
export (192 kB first load on the playground route). The brand palette is in the bundle and
the mark renders in the nav.

Two things are **not** verified, and matter:

**The UI has never spoken to a running instance.** Request and response shapes come from
`openapi.yaml` and the real `scrape.ts` route body, but no request has been made. The first
live run will find things.

**`next build` cannot run from `E:`.** Every file on that drive fails Node's `readlinkSync`
with `EISDIR` where `EINVAL` is expected, and Next calls `readlink` unconditionally during
page-data tracing. Confirmed against `package.json` itself, so it is the drive rather than
anything in the build output, and it reproduces under both webpack and Turbopack. Typecheck
and lint run fine in place; the full build was verified by copying to `C:`. Worth fixing at
the filesystem level, or the repo will need to live elsewhere to build.

One smaller note: the repo uses pnpm, but pnpm is not installed on this machine, so the
dashboard was installed with npm. A `pnpm install` at the root should fold it into the
workspace lockfile once pnpm is available.

---

## 8. Open questions

Settled by decision rather than by asking, and worth revisiting if any turns out wrong:

- **Localhost auth bypass.** Currently: always require a key. Simpler, one code path, and it fails safe if someone exposes the port. Revisit if the friction annoys in practice.
- **Result persistence.** The playground does not store history. Results already live in Postgres for crawls; scrape results are ephemeral by design. A history panel is plausible later.
- **A marketing site.** Deferred entirely. The dashboard is the priority, and the two share only a design system.
- **Docs.** Not in this plan. When they arrive, the `.md` twin convention is worth adopting from the outset rather than retrofitting.

---

## 9. Deliberately excluded

- Pricing, billing, credit balances — there is nothing to bill
- Signup, login, password reset, teams, roles — one operator, no accounts
- Usage-limit warnings and upgrade prompts — the limits are the operator's own
- Testimonials, logo walls, social proof — this is not a sales surface
- Any suggestion that a paid tier exists
