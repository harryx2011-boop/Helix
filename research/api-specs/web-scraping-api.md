# Helix — Web Scraping API Spec

## 1. Goal
Given a single URL, return clean, LLM-ready content (markdown, HTML, structured JSON, or screenshot) in one call. This is the foundational primitive every other Helix API builds on (Crawl, Search, Monitor all call Scrape internally). Fully open source and self-hosted — no hosted/cloud tier.

## 2. Architecture
- **TypeScript API gateway**: auth (local API keys, self-managed), request validation, job queueing, response formatting.
- **Rust worker pool**: does the actual fetch + render. Owns the headless browser pool (e.g. via `chromiumoxide` or a custom CDP client), handles JS rendering, smart-wait, proxy rotation, retries.
- **Python service**: post-processing layer — HTML→markdown conversion, boilerplate/nav/ad stripping, schema-based structured extraction (calls the operator's configured LLM provider when `formats: ["json"]` is requested with a prompt/schema — see BYOK below).
- Flow: Gateway (TS) → enqueue job → Rust worker fetches/renders → raw HTML handed to Python for cleaning/extraction → result returned to Gateway → response to client.

## 3. BYOK — AI Provider Configuration
Any AI-assisted feature (JSON extraction via prompt, future AI-resolved actions) requires the self-hoster to supply their own API key for one of the supported providers. Configured via environment variables or a config file, not stored/managed by Helix itself.

Supported providers: `anthropic` (Claude), `openai`, `openrouter`, `google` (Gemini).

```env
HELIX_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# or
HELIX_LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
# or
HELIX_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
HELIX_LLM_MODEL=anthropic/claude-sonnet-4.5
# or
HELIX_LLM_PROVIDER=google
GOOGLE_API_KEY=...
```

A request can optionally override the default provider/model per call (see `jsonOptions.provider` below), as long as a key for that provider is configured on the instance.

## 4. Endpoint

### `POST /v1/scrape`

**Request**
```json
{
  "url": "https://example.com/page",
  "formats": ["markdown", "html", "json", "screenshot", "links"],
  "onlyMainContent": true,
  "waitFor": 0,
  "timeout": 30000,
  "mobile": false,
  "actions": [],
  "jsonOptions": {
    "schema": { "type": "object", "properties": { "title": { "type": "string" } } },
    "prompt": "Extract the product title and price",
    "provider": "anthropic",
    "model": "claude-sonnet-4.5"
  },
  "headers": { "Cookie": "..." },
  "proxy": "auto"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "markdown": "# Page Title\n...",
    "html": "<html>...</html>",
    "json": { "title": "..." },
    "screenshot": "/screens/abc123.png",
    "links": ["https://example.com/a", "https://example.com/b"],
    "metadata": {
      "title": "Page Title",
      "sourceURL": "https://example.com/page",
      "statusCode": 200,
      "language": "en"
    }
  }
}
```

## 5. Schemas
- `ScrapeRequest`: `url` (required, string, URL), `formats` (enum array), `onlyMainContent` (bool, default true), `waitFor` (ms), `timeout` (ms), `mobile` (bool), `actions` (see Browser Interaction spec), `jsonOptions` (schema + prompt + optional `provider`/`model` override), `headers` (object), `proxy` (`auto` | `stealth` | `none`).
- `ScrapeResponse`: `success`, `data` (per-format keys, only populated for requested formats), `metadata`, `error` (on failure).

## 6. Infra notes
- Rust worker pool sized independently from TS gateway — scale workers on queue depth, not request rate. Instance operator controls pool size via config/deployment (e.g. Docker Compose replica count, k8s HPA).
- Cache raw HTML by URL hash for a short TTL (e.g. 10 min), stored locally (Redis or on-disk), to dedupe near-simultaneous scrapes of the same page.
- Respect `robots.txt` for the `HelixAgent` user-agent by default; expose a config flag for operators who want to opt out on their own instance.
- No metering/billing layer — rate limiting (if any) is left to the operator (e.g. reverse proxy config, or an optional simple per-key rate limit toggle).

## 7. Open questions
- [ ] Which headless engine for the Rust worker — raw CDP or wrap Playwright's Rust bindings?
- [ ] Proxy support: bring-your-own-proxy config only, or ship a pluggable interface for common providers?
- [ ] Screenshot storage: local disk/volume by default, with optional S3-compatible object storage for larger self-hosted deployments?
