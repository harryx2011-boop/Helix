# Helix — Web Monitoring API Spec

## 1. Goal
Watch a URL (or a crawl scope) on a schedule and notify the caller when content changes — the "notify my agent when the web changes" primitive. Built on top of Scrape/Crawl, with a diff layer and a scheduler on top. Open source, self-hosted, no metered billing.

## 2. Architecture
- **TypeScript API gateway**: CRUD for monitors, webhook config.
- **Scheduler** (e.g. a cron-style job runner, could live in TS or as a lightweight Rust service, self-hosted alongside the rest of Helix): triggers each monitor's check at its configured interval.
- **Rust worker pool**: reuses the Scrape (or Crawl, for multi-page monitors) pipeline to re-fetch the target(s) on each check.
- **Python service**: diffing layer — compares new markdown/JSON against the last stored snapshot, computes a change summary (added/removed/changed text, or schema field diffs if `jsonOptions` is set), and decides whether the change crosses the configured sensitivity threshold.
- **Storage**: snapshot history per monitor (last N versions), stored in the same self-hosted Postgres instance used by Crawl, so diffs and a change timeline are available, not just a single most-recent state.
- Flow: Scheduler fires → Rust worker fetches current state → Python diffs against last snapshot → if changed (and above threshold) → webhook fired + new snapshot stored → else snapshot still stored (for timeline) but no webhook.

## 3. BYOK — AI Provider Configuration
Same instance-wide BYOK setup as the other Helix APIs. Relevant if `jsonOptions` is set (field-level diffing on extracted JSON) or if "significant" sensitivity filtering uses an LLM-judged relevance pass (see open questions).

## 4. Endpoints

### `POST /v1/monitor` — create a monitor
**Request**
```json
{
  "url": "https://example.com/pricing",
  "schedule": "0 * * * *",
  "scrapeOptions": { "formats": ["markdown"] },
  "jsonOptions": { "schema": { "type": "object", "properties": { "price": { "type": "number" } } } },
  "sensitivity": "any",
  "webhook": "https://myapp.com/webhooks/helix-monitor"
}
```

**Response**
```json
{ "success": true, "monitorId": "mon_def456", "status": "active", "nextCheckAt": "2026-08-24T13:00:00Z" }
```

### `GET /v1/monitor/{monitorId}` — status + latest snapshot
### `GET /v1/monitor/{monitorId}/history` — change timeline
### `PATCH /v1/monitor/{monitorId}` — update schedule/config
### `DELETE /v1/monitor/{monitorId}` — stop and delete a monitor

## 5. Schemas
- `MonitorRequest`: `url` (required; or `crawlConfig` for multi-page monitors), `schedule` (cron string, operator-configurable minimum interval), `scrapeOptions`, `jsonOptions` (if set, diffs are field-level on the extracted JSON rather than raw text), `sensitivity` (`any` | `significant` — significant filters out trivial whitespace/ad/timestamp noise), `webhook`.
- `MonitorStatusResponse`: `monitorId`, `status` (`active` | `paused` | `error`), `lastCheckedAt`, `nextCheckAt`, `lastChangeAt`, `latestSnapshot`.
- `MonitorHistoryEntry`: `checkedAt`, `changed` (bool), `diff` (text diff or JSON field diff), `snapshotUrl`.

## 6. Infra notes
- Minimum schedule interval should be operator-configurable to control worker load on their own instance — no plan-tier gating, just a sane default (e.g. hourly) that can be loosened for a beefier deployment.
- Snapshot storage needs retention limits (e.g. last 30 snapshots or 90 days) with older history pruned, configurable per instance to manage local disk/DB usage.
- Sensitivity filtering matters a lot in practice — most pages have some noise (rotating ads, "updated 2 min ago" timestamps) that would otherwise trigger false-positive change alerts on every check.
- Webhook delivery shares the same retry/dead-letter infra as the Crawl API.

## 7. Open questions
- [ ] Do monitors reuse the Crawl orchestrator directly for multi-page scope, or is that a v2 feature (single-URL only for v1)?
- [ ] What's the actual diff algorithm for "significant" sensitivity — heuristic noise filters, or an LLM-judged relevance pass (costs the operator's own API budget, better signal)?
- [ ] Notification channels beyond webhook (email, Slack) — v1 or later?
