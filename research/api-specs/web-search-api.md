# Helix — Web Search API Spec

## 1. Goal
Take a query, return relevant results from across the web, with full scraped page content already attached — one call instead of search-then-scrape. Open source, self-hosted, no hosted tier or metered billing.

## 2. Architecture
- **TypeScript API gateway**: auth (local API keys), request validation, fan-out orchestration.
- **Search backend**: self-hosters bring their own — Helix ships adapters for common self-hostable/open options (e.g. SearXNG instance) and BYOK third-party SERP APIs (e.g. an operator-supplied key for a search provider), configurable per instance. No bundled/managed search index.
- **Rust worker pool**: takes the top-N result URLs and scrapes each in parallel (reuses the Web Scraping API pipeline).
- **Python service**: cleans/converts each scraped result to markdown, same as Scrape.
- Flow: Gateway (TS) → query sent to configured search backend → ranked URL list returned → Rust workers scrape each URL concurrently → Python cleans each → results assembled and returned together.

## 3. BYOK — AI Provider Configuration
Same instance-wide BYOK setup as the other Helix APIs (see Web Scraping API spec). Not required for Search itself (search + scrape needs no LLM), only relevant if `scrapeOptions.jsonOptions` requests structured extraction on the scraped results.

## 4. Endpoint

### `POST /v1/search`

**Request**
```json
{
  "query": "best transactional email APIs 2026",
  "limit": 5,
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true
  },
  "lang": "en",
  "country": "us",
  "tbs": "qdr:m"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "web": [
      {
        "url": "https://example.com/best-email-apis",
        "title": "13 Best Transactional Email APIs",
        "description": "A comparison of...",
        "markdown": "# 13 Best...\n...",
        "metadata": { "statusCode": 200 }
      }
    ]
  }
}
```

## 5. Schemas
- `SearchRequest`: `query` (required), `limit` (default 5, operator-configurable max), `scrapeOptions` (same shape as `ScrapeRequest.formats`/`onlyMainContent`, optional — if omitted, only URL/title/description returned with no scrape), `lang`, `country`, `tbs` (time-based search filter, e.g. past month).
- `SearchResponse`: `success`, `data.web[]` (each item: `url`, `title`, `description`, plus scrape fields if `scrapeOptions` given), `error`.

## 6. Infra notes
- Cap concurrent per-request scrapes (e.g. max 10 parallel) to avoid one search call monopolizing the Rust worker pool.
- Partial success handling: if 2 of 5 result pages fail to scrape, return the 3 that succeeded with `success: true` and a `warnings` array, not a hard failure.
- Optional short-TTL local cache on `(query, country, lang)` to avoid re-hitting the search backend for identical queries within a small window.
- Since the search backend is BYO (SearXNG or a third-party API key), document setup for at least one self-hostable option (SearXNG) so a fresh instance is usable with zero external dependencies.

## 7. Open questions
- [ ] Default self-hostable search backend: bundle a SearXNG adapter as the reference implementation?
- [ ] Do we support search verticals (news, images) in v1, or web-only?
- [ ] Should the search-backend adapter interface be pluggable (so the community can add more providers) from day one?
