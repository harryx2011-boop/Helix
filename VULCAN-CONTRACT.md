# Vulcan — build contract

A Claude Code usage/cost dashboard for Helix's own development sessions.
Inspired by `claudit` (github.com/Nitjsefnie/claudit) — same class of
transcript-accounting bugs, own implementation, own logo.

Not a product Helix sells or self-hosters need. It is a dev-facing tool for
the person building Helix, so it lives inside the dashboard but is scoped
away from the public API surface, `catalog.ts`, and self-host defaults.

## 1. Identity

- Product name: **Vulcan**. Not listed in `lib/catalog.ts` — it is not a
  public API product and has no OpenAPI/MCP surface.
- Mark (1.22.0): a forge flame with three tongues and an amber core, two
  gradient fills (red→orange body, amber→pale core), no outline; reads
  clean at 16px. Firecrawl's favicon was the legibility reference, not the
  silhouette. Static SVG at icon sizes (sidebar, nav tile); at header size
  the outer and core paths morph on different periods plus a glow pulse, a
  continuous ambient loop rather than a state transition, so Emil's
  150–300ms rule doesn't apply. `components/vulcan/ascii-fire.tsx` adds
  Firecrawl-style ASCII-character flames on canvas behind the header (heat
  grid, ember-ramp colours, 18 fps while in view). Both honour
  `prefers-reduced-motion` by freezing to one frame.
- Design system: the dashboard's own token names (`--background`,
  `--primary`, `--border`, `--radius`, `card`/`panel` at 6px/8px), with
  their values re-tinted warm under a scoped `[data-surface='vulcan']`
  block (see §5). Components stay colour-class-free.
- Theme: follows the dashboard's ThemeProvider (dark-default with
  `.dark` on `<html>`), not a fixed light-only surface like Convert.

## 2. Ports / hosting

None of its own. Served by the dashboard on **3400**, at
**`/app/vulcan`**, behind the existing `/app(.*)` auth gate (Clerk).

**Local-only by design.** Vulcan reads Claude Code transcripts from the
operator's own filesystem (`~/.claude/projects/**/*.jsonl` on the machine
running the dashboard's dev server). There is no ingest into Supabase, no
new migration, no hosted-deployment behavior. The route exists only when the
request's `Host` is a loopback name (`lib/vulcan/gate.ts`), 404 otherwise.
The nav row is always present but shows a lock and a `localhost` label when
the gate is false, and the page then renders `vulcan-locked.tsx` (header plus
the reason and the local command) rather than the dashboard. In self-host
mode (a static export with no route handlers) the gate is false outright. This is deliberate: Vulcan tracks *your* local dev
usage, not a hosted multi-tenant feature.

## 3. Auth

Inherits whatever gates `/app/*` today (Clerk, same as Playground/Agent/
Keys/Settings). No separate access control.

## 4. Data source & correctness (the actual engineering, ported from claudit)

Three bugs claudit's writeup identified, all real and independently
verified in claudit's own source, apply equally to any tool reading these
transcripts:

1. **Streamed replies write one JSONL line per content block**, all
   sharing `message.id`/`requestId`; only the *last* line per request
   carries the true `output_tokens`. Naive per-line summing silently
   undercounts. Fix: **max-merge by `requestId`** within a file — take the
   maximum observed value per usage field across all lines sharing a
   request, not the sum and not the first/last.
2. **Cache writes are priced by TTL**, not a flat rate: a 5-minute
   ephemeral write is 1.25× base input, a 1-hour write is 2×. Flattening
   this to one multiplier misprices every 1h write. Fix: read
   `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` off the usage
   block where present; a `cache_creation_input_tokens` total with no
   split (older SDK versions) is charged at the conservative 5m rate.
3. **Subagent transcripts can duplicate their parent's lines** across
   files sharing a `uuid`. Fix: **cross-file dedup on `uuid`** at query
   time (`DISTINCT ON`), not at ingest time — keeps ingest idempotent and
   re-runnable.

Rate table: pinned per-model `{fresh, create_5m, create_1h, read, output}`
per-million-token prices, with **dated overrides** for time-boxed intro
pricing (e.g. Sonnet 5's launch rate expiring on a fixed date) rather than
one static number per model. An unrecognized model falls back to its
family's rates and the response marks the figure `estimated: true` — never
invents a price silently.

## 5. Scope — v1 panels

1. Burn rate over time (cost/day or cost/session, bucketed)
2. Cost by model
3. Token breakdown — input / output / cache read / cache write
4. Cache TTL split — 5m vs 1h writes
5. Per-session context growth
6. Tool usage counts (which tools fire, how often)

**Added in 1.21.0** (were cut from v1): reply latency, tool error rate,
weekday×hour cost heatmap, reply-size distribution, plus spend by project,
costliest sessions, per-day stacking by model, and thinking share.

Palette: a scoped `[data-surface='vulcan']` token block in `globals.css`
(warm near-black ground, Firecrawl orange `18 96% 54%` as `--primary`, ember
ramp `--v-1`..`--v-5` for charts). It overrides the shadcn variables the page
frame already reads, so no Vulcan component carries a colour class.

## 6. Code layout

| Layer | Path | Contents |
|---|---|---|
| Logo | `apps/dashboard/components/vulcan/vulcan-flame.tsx` | SVG flame, `animated` prop, static reduced-motion fallback |
| Page | `apps/dashboard/app/(app)/app/vulcan/page.tsx` + `vulcan-client.tsx` | Panel grid, client-side charts |
| Sidebar | wherever Playground/Agent/Keys register today | Vulcan icon + label, added alongside those |
| Ingest | `apps/dashboard/lib/vulcan/ingest.ts` | Walks JSONL files, per-request max-merge (server-only, `fs`) |
| Pricing | `apps/dashboard/lib/vulcan/pricing.ts` | Rate table, TTL-split calc, dated overrides, `estimated` flag |
| Aggregation | `apps/dashboard/lib/vulcan/aggregate.ts` | Cross-file uuid dedup, panel-shaped rollups |
| API routes | `apps/dashboard/app/api/vulcan/*` | Server-only handlers calling ingest/aggregate; never exposed via `openapi.yaml` or MCP |
| Cache | in-memory recompute per request for v1; revisit only if ingest proves slow on real transcript volume | No new Postgres table, no Supabase migration |

## 7. Explicit non-goals (v1)

- No multi-user / multi-tenant support — single operator, one machine.
- No upload path for transcripts — matches claudit's "no upload, by
  design" stance; this only ever reads local disk.
- No public API product listing, no SDK method, no MCP tool.
- No new database dependency (SQLite or Postgres) until in-memory
  recompute is proven too slow against real transcript volume.
