# Helix

**Self-hostable, BYOK web-data API.** Turn web pages and documents into clean, structured, LLM-ready data — using your own models, your own proxies, your own storage.

> Status: pre-implementation. The design is settled ([ARCHITECTURE.md](ARCHITECTURE.md), [openapi.yaml](openapi.yaml)); the code is being built to it.

---

## Why

Existing web-data APIs sell you credits and rent you a model. That has three consequences their users complain about constantly:

- **Costs are unpredictable.** Credits expire monthly, retries are billed, and a bot-challenge page can be charged as a success.
- **The open-source build is crippled.** The part that actually gets past anti-bot protection is held back for the paid tier.
- **The licence blocks commercial use.** AGPL means most companies cannot embed it without giving away their own source.

Helix inverts all three.

**Bring your own key.** Helix never bundles an LLM, a proxy pool or a vector store. You configure your providers; they bill you directly. Helix takes no margin on inference, which means it has no incentive to be vague about what a job actually did.

**The self-host build is the whole product.** Nothing is withheld. There is no cloud-only tier.

**Apache-2.0.** Embed it in whatever you like.

## What it does

| | |
|---|---|
| `/scrape` | Read one URL. Web pages and documents return the same envelope. |
| `/crawl` | Discover and read a whole site. Adaptive politeness, robots-aware. |
| `/map` | List a site's URLs without reading them. |
| `/search` | Search the web, optionally reading every result in the same call. |
| `/enrich` | Turn a sparse identifier into structured columns with citations. |
| `/monitors` | Scheduled re-reads with inline diffs. Unchanged pages are free. |

Plus an MCP server, so agents can call it directly.

## Quick start

```bash
cp .env.example .env      # add your LLM key, or use a local model
docker compose up
```

That is the whole setup. Every service is health-gated, so there is no boot race to retry past.

- **Dashboard** — `http://localhost:3400`
- **API** — `http://localhost:7400/v1`

The dashboard and API run on separate ports (the project's FE/BE convention), so
the dashboard calls the API cross-origin; the API allows the dashboard's origin
through CORS by default.

```bash
curl -X POST localhost:7400/v1/scrape \
  -H "Authorization: Bearer $HELIX_BOOTSTRAP_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}'
```

## Design commitments

These are load-bearing, not aspirations. Each one exists because its absence is a documented failure in a product people use today.

**A block page is a failure.** A bot challenge returning HTTP 200 comes back as a typed failure with a reason, never as markdown pretending to be content.

**Rate limiting fails open.** If the limiter's backing store is unreachable, your request proceeds and the server logs a warning. Helix's infrastructure trouble never becomes your 429. Every response carries `X-RateLimit-*` headers so agents can self-throttle without parsing error strings.

**Estimate before you run.** Any operation whose cost scales with discovered pages accepts `estimate: true` and reports projected pages, time, tokens and provider spend without doing the work.

**Schema enforcement solves shape, not truth.** Constrained decoding guarantees valid JSON and guarantees nothing about accuracy. Helix rejects `minItems`/`maxItems` in extraction schemas because they make models invent entries to satisfy them.

**No data is a real answer.** Enrichment returns `null` with a reason rather than a plausible fabrication.

## How it fits together

Three runtimes, each the right tool for its layer, behind one HTTP surface.

```
client / MCP  ──►  helix-api (TypeScript)  ──►  helix-fetch   (Rust)    TLS identity, proxy egress
                   routes, jobs, browser        helix-extract (Python)  parsing, LLM, embeddings
                   pool, orchestration          postgres + pgvector     jobs, results, vectors
```

Fetching escalates only on evidence — cheapest tier first, moving up when a block is detected, content is genuinely absent from the raw HTML, or a requested capability demands a browser. Framework detection alone never triggers escalation, because server-rendered React often needs no browser at all.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and [RESEARCH.md](RESEARCH.md) for the evidence behind each decision.

## Development

```bash
pnpm install
pnpm codegen     # types for all three runtimes, generated from openapi.yaml
pnpm dev
```

The OpenAPI document is the source of truth. Clients are generated from it rather than hand-written, which is how schema drift between docs, SDKs and runtime gets designed out instead of debugged later.

## Licence

Apache-2.0.
