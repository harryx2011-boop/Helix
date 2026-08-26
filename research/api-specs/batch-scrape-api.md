# Helix — Batch Scrape API Spec

> **Status: proposed, not implemented.** `/batch/scrape` was removed from
> `openapi.yaml` under the spec-first rule (WEBSITE.md §650): the spec must not
> describe routes the code does not serve. This document is the surface put up
> for review *before* any route exists. Nothing here is live.

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

## 6. Open questions for review
1. **Path shape.** `/v1/batch/scrape` matches the removed-from-openapi name.
   `/v1/scrape/batch` would nest under the primitive it extends. Which?
2. **Sync threshold.** Is 10 the right ceiling for the synchronous form, or
   should the route be async-only to keep one execution path?
3. **`HELIX_BATCH_MAX_URLS` default.** 1000 mirrors `crawlDefaultLimit`; a
   batch is caller-supplied rather than discovered, so a higher ceiling may fit.
