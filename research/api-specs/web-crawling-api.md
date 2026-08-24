# Helix — Web Crawling API Spec

## 1. Goal
Given a starting URL, follow links across a site (or section of it) and scrape each discovered page, with controls for depth, page limits, and path filters. Long-running/async by nature — unlike Scrape/Search, results aren't returned synchronously. Open source, self-hosted, no metered billing.

## 2. Architecture
- **TypeScript API gateway**: accepts crawl job, validates config, creates a job record, returns a `jobId` immediately (async pattern).
- **Rust crawl orchestrator**: owns the frontier (queue of discovered-but-unvisited URLs), dedupes by normalized URL, enforces depth/limit/path rules, respects `robots.txt`, and dispatches individual page fetches to the same Rust scrape workers used by the Scraping API.
- **Python service**: cleans each fetched page same as Scrape.
- **Job store** (self-hosted Postgres + Redis for the live queue — both run as containers alongside Helix): tracks job status, discovered URL count, completed count, and holds results until polled or webhooked out.
- Flow: Gateway (TS) → job created, `jobId` returned → Rust orchestrator crawls (BFS by default) → each page → Python cleans → result written to job store → client polls `GET /v1/crawl/{jobId}` or receives a webhook per page/on completion.

## 3. BYOK — AI Provider Configuration
Same instance-wide BYOK setup as the other Helix APIs. Only relevant if `scrapeOptions.jsonOptions` is set on the crawl, for structured extraction per page.

## 4. Endpoints

### `POST /v1/crawl` — start a crawl
**Request**
```json
{
  "url": "https://example.com",
  "limit": 100,
  "maxDepth": 3,
  "includePaths": ["/blog/*"],
  "excludePaths": ["/blog/tag/*"],
  "allowExternalLinks": false,
  "scrapeOptions": { "formats": ["markdown"] },
  "webhook": "https://myapp.com/webhooks/helix"
}
```
**Response**
```json
{ "success": true, "jobId": "crawl_abc123", "url": "http://localhost:3000/v1/crawl/crawl_abc123" }
```

### `GET /v1/crawl/{jobId}` — poll status/results
**Response**
```json
{
  "status": "scraping",
  "total": 100,
  "completed": 42,
  "data": [
    { "url": "https://example.com/blog/post-1", "markdown": "..." }
  ]
}
```
`status` enum: `scraping` | `completed` | `failed` | `cancelled`.

### `DELETE /v1/crawl/{jobId}` — cancel a running crawl

## 5. Schemas
- `CrawlRequest`: `url` (seed, required), `limit` (max pages, operator-configurable default), `maxDepth`, `includePaths`/`excludePaths` (glob patterns), `allowExternalLinks` (bool), `scrapeOptions` (same as Scrape), `webhook` (optional URL, POSTed per page and on completion).
- `CrawlStatusResponse`: `status`, `total`, `completed`, `data[]` (each a `ScrapeResponse.data`-shaped object), `error`.

## 6. Infra notes
- BFS traversal by default so `maxDepth` behaves predictably; make traversal strategy (BFS vs DFS) configurable later if needed.
- Frontier dedup must normalize URLs (strip tracking params, trailing slashes, resolve relative links) before checking against the visited set.
- Webhook delivery needs retry-with-backoff and a dead-letter path if the target endpoint is down.
- Long crawls (thousands of pages) should be resumable — persist frontier state in the self-hosted job store so a worker crash doesn't lose progress.
- Since there's no billing layer, guard against runaway crawls with sane operator-configurable defaults/hard caps on `limit` and `maxDepth`.

## 7. Open questions
- [ ] Sensible default and hard-cap `limit`/`maxDepth`, given there's no cost signal to naturally bound usage?
- [ ] Do we support scheduled/recurring crawls in v1, or is that deferred to the Monitoring API?
- [ ] Sitemap.xml as an optional faster seed for the frontier instead of pure link-following?
