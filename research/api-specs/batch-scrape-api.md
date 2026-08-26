# Helix — Batch Scrape API Spec

> **Status: shipped (2026-08-26).** Reviewed and built as specified, with the
> open questions below resolved: the path stayed `/v1/batch/scrape`, the
> synchronous form was dropped so there is one execution path, and the ceiling
> is 10,000. Route `apps/api/src/routes/batch.ts`, 14 tests, three MCP tools.

## 1. Goal
Scrape many URLs in one call, with one job to poll, instead of making the caller
fan out N `/scrape` requests and reassemble the results. Same per-URL options as
`/scrape`, same result envelope, but asynchronous by default because a batch of
any size outlives a request timeout.

The primitive already exists — this is `/scrape` run under the job machinery
that `/crawl` already uses. It adds no new fetch, extract or browser behaviour.

## 2. Why it is a route and not a client loop
A caller looping over `/scrape` gets no shared concurrency budget, no single
cancel, no one webhook when the set finishes, and re-pays request overhead per
URL. Crawl already owns per-host politeness and a worker pool; a batch is a
crawl whose frontier is supplied rather than discovered.

## 3. Endpoint

### `POST /v1/batch/scrape`

Accepts the full `/scrape` request body per URL, minus `url` itself, hoisted to
the top level as shared defaults.

**Request**
```json
{
  "urls": ["https://a.example/x", "https://b.example/y"],
  "formats": ["markdown"],
  "onlyMainContent": true,
  "timeout": 30000,
  "jsonOptions": {
    "schema": { "type": "object", "properties": { "title": { "type": "string" } } },
    "prompt": "Extract the title"
  },
  "webhook": "https://caller.example/hooks/batch",
  "maxConcurrency": 5,
  "ignoreInvalidURLs": false
}
```

**Response — 202**
```json
{
  "success": true,
  "jobId": "0d9f7c1e-1a3c-4d21-9f0e-5b6a2c8d4e11",
  "total": 2,
  "url": "https://api.helix.dev/v1/batch/scrape/0d9f7c1e-..."
}
```

Results are read with the existing job views, unchanged:
`GET /v1/batch/scrape/{jobId}` and `GET /v1/jobs/{id}` serve the same cursor-
paginated body as a crawl, each item carrying the `/scrape` document shape plus
the `url` it came from. `DELETE` cancels.

### Synchronous form
`"async": false` returns 200 with the full result array instead of 202, and is
rejected with `400 batch_too_large` above 10 URLs — a bounded convenience for
small sets, not a second execution path.

## 4. Failure semantics
A batch does not fail because one URL did. Each item carries its own
`success`/`error`, the job carries `completed` and `failed` counts, and the job
reaches `completed` when every item is terminal. `ignoreInvalidURLs: true`
drops unparseable URLs at validation and reports them in `invalidURLs` rather
than rejecting the whole request.

## 5. Limits
| Guard | Default | Source |
|---|---|---|
| URLs per batch | 1000 | new `HELIX_BATCH_MAX_URLS` |
| Sync-form URLs | 10 | fixed |
| Concurrency | `maxConcurrency`, capped by `HELIX_MAX_HOST_CONCURRENCY` | existing |
| Per-host politeness | inherited from the crawl scheduler | existing |
| Result retention | `HELIX_RESULT_TTL_HOURS` (168) | existing |

Robots and the URL guard (`allowPrivateUrls`) apply per URL exactly as in
`/scrape`. A batch is not a way to bypass either.

## 6. Resolved questions
1. **Path shape** — kept `/v1/batch/scrape`. It is the name already removed from
   `openapi.yaml`, and it matches what callers coming from Firecrawl expect.
2. **Sync threshold** — dropped. A synchronous form would be a second execution
   path for work that outlives a request timeout at any interesting size.
3. **Ceiling** — 10,000, not the 1,000 that mirrors `crawlDefaultLimit`. A
   supplied list is bounded by the caller; a crawl frontier is not.

## 7. What shipped differs from §3 in one place

The synchronous form described there does not exist. Everything else matches:
the request shape, the 202, the job views under `/v1/batch/scrape/{jobId}`, and
per-item failure semantics.

Batch semantics come from options the frontier already understood rather than
new worker code — `maxDepth: 0` rejects every discovered link as too deep and
`sitemap: 'skip'` removes the other source of unasked-for URLs. Verified live
against two hosts: `example.com` links to `iana.org`, and the job finished with
exactly the two supplied tasks.
