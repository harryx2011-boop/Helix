# @helix/sdk

Typed client for the [Helix](https://github.com) web-data API. No runtime dependencies — built on global `fetch`, works in Node 22+ and the browser.

```
pnpm add @helix/sdk
```

## Quick start

```ts
import { HelixClient } from '@helix/sdk';

const helix = new HelixClient({ apiKey: 'hx_...' });

const result = await helix.scrape({ url: 'https://example.com' });
if (result.success) {
  console.log(result.data.markdown);
} else {
  console.error(result.failure.reason, result.failure.detail);
}
```

`baseUrl` defaults to `http://localhost:7400/v1`, matching the local self-hosted default. Point it at your deployment for anything else:

```ts
const helix = new HelixClient({ baseUrl: 'https://helix.yourcompany.com/v1', apiKey: 'hx_...' });
```

## Failure semantics

Helix distinguishes two kinds of failure, and this client mirrors the distinction rather than collapsing it:

- **A typed failure inside a 200/201** — the request was well-formed and Helix tried, but the target page was blocked, timed out, or a configured model was unreachable. `scrape()`, `parse()`, `interact()` and `agentSchema()` resolve normally with `success: false` and a `failure` object. Check `success` before reading `data`.
- **An HTTP error** — your request was malformed, unauthorized, rate-limited, or the resource didn't exist. These reject with `HelixApiError`, which carries `status` and the parsed `body` (`{ error, message, field?, requestId? }`).

```ts
import { HelixApiError } from '@helix/sdk';

try {
  const result = await helix.scrape({ url: 'not a url' });
} catch (error) {
  if (error instanceof HelixApiError) {
    console.error(error.status, error.body?.message);
  }
}
```

## Reading and writing pages

```ts
// Structured extraction with your own model
const pricing = await helix.scrape({
  url: 'https://example.com/pricing',
  formats: ['markdown', 'json'],
  jsonOptions: {
    schema: { type: 'object', properties: { plans: { type: 'array' } } },
    prompt: 'Extract every pricing plan on the page.',
  },
});

// Act on a rendered page before reading it
const rendered = await helix.scrape({
  url: 'https://example.com/app',
  tier: 'chromium',
  formats: ['markdown', 'screenshot'],
  actions: [
    { type: 'click', selector: '#accept-cookies' },
    { type: 'wait', milliseconds: 500 },
  ],
});

// Parse a document, either by URL or by upload
const parsed = await helix.parse({ url: 'https://example.com/report.pdf', formats: ['markdown'] });

const upload = await helix.parse({
  file: new Blob([fileBytes], { type: 'application/pdf' }),
  filename: 'invoice.pdf',
  formats: ['markdown', 'json'],
  jsonOptions: { schema: { type: 'object', properties: { invoiceTotal: { type: 'number' } } } },
});
```

## Discovery and multi-page work

```ts
// List a site's URLs without reading them
const map = await helix.map({ url: 'https://docs.example.com' });

// Cost estimate before crawling
const estimate = await helix.crawl({ url: 'https://docs.example.com', estimate: true });

// Crawl for real, then poll
const crawl = await helix.crawl({ url: 'https://docs.example.com', limit: 200 });
if ('jobId' in crawl) {
  const job = await helix.getCrawl(crawl.jobId);
  console.log(job.status, job.completed, '/', job.total);
}

// Read a fixed list of URLs as one job
const batch = await helix.batchScrape({ urls: ['https://a.example.com', 'https://b.example.com'] });
const batchJob = await helix.getBatchScrape(batch.jobId);

// Cancel either kind of job
await helix.cancelCrawl(crawl.jobId);
await helix.cancelJob(batchJob.jobId);

// See what failed and why
const errors = await helix.getJobErrors(batchJob.jobId);
```

## Search

```ts
const results = await helix.search({
  query: 'transactional email APIs',
  limit: 5,
  scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
});

for (const result of results.data.web) {
  if (result.failure) continue;
  console.log(result.title, result.markdown?.slice(0, 200));
}
```

## Building a schema

```ts
const { schema, summary } = await helix.agentSchema({
  prompt: 'Every pricing plan on the page, with its name, monthly price and included features.',
});
```

## Browser sessions

```ts
// One-shot: open, act, close
const session = await helix.interact({
  url: 'https://example.com/shop',
  actions: [
    { type: 'click', selector: '#accept-cookies' },
    { type: 'type', selector: '#search', text: 'wireless keyboard' },
    { type: 'press', key: 'Enter' },
    { type: 'wait', selector: '.results' },
    { type: 'extract', prompt: 'Get the price of the first result' },
  ],
});
if (session.success) console.log(session.output);

// Keep a session open across calls
const opened = await helix.openInteractSession({ url: 'https://example.com/shop' });
if ('sessionId' in opened) {
  await helix.interact({ sessionId: opened.sessionId, actions: [{ type: 'click', selector: '.next-page' }], keepSessionOpen: true });
  console.log(helix.interactLiveStreamUrl(opened.sessionId, opened.liveViewUrl.split('token=')[1] ?? ''));
  await helix.closeInteractSession(opened.sessionId);
}
```

## Monitors

```ts
const monitor = await helix.createMonitor({
  url: 'https://example.com/pricing',
  schedule: '0 * * * *',
  sensitivity: 'significant',
  webhook: 'https://your.app/webhooks/helix',
});

await helix.checkMonitor(monitor.id);

const history = await helix.monitorHistory(monitor.id, { limit: 20 });
const deliveries = await helix.monitorDeliveries(monitor.id);

await helix.updateMonitor(monitor.id, { status: 'paused' });
await helix.deleteMonitor(monitor.id);
```

## Provider keys

Store your own LLM credentials against your Helix API key so extraction calls use them instead of the instance's environment credentials:

```ts
await helix.saveProvider('anthropic', { apiKey: 'sk-ant-...', model: 'claude-sonnet-4-5' });
const providers = await helix.listProviders();
await helix.removeProvider('anthropic');
```

## Health

```ts
const health = await helix.health();
console.log(health.status);
```

## API surface

| Method | Endpoint |
|---|---|
| `scrape` | `POST /scrape` |
| `parse` | `POST /parse` |
| `map` | `POST /map` |
| `search` | `POST /search` |
| `crawl` | `POST /crawl` |
| `getCrawl` | `GET /crawl/{jobId}` |
| `cancelCrawl` | `DELETE /crawl/{jobId}` |
| `batchScrape` | `POST /batch/scrape` |
| `getBatchScrape` | `GET /batch/scrape/{jobId}` |
| `cancelBatchScrape` | `DELETE /batch/scrape/{jobId}` |
| `getJob` | `GET /jobs/{id}` |
| `cancelJob` | `DELETE /jobs/{id}` |
| `getJobErrors` | `GET /jobs/{id}/errors` |
| `agentSchema` | `POST /agent/schema` |
| `interact` | `POST /interact` |
| `openInteractSession` | `POST /interact/session` |
| `getInteractSession` | `GET /interact/session/{sessionId}` |
| `closeInteractSession` | `DELETE /interact/session/{sessionId}` |
| `interactLiveStreamUrl` | builds the `GET /interact/live/{sessionId}/stream` URL |
| `listMonitors` | `GET /monitor` |
| `createMonitor` | `POST /monitor` |
| `getMonitor` | `GET /monitor/{id}` |
| `updateMonitor` | `PATCH /monitor/{id}` |
| `deleteMonitor` | `DELETE /monitor/{id}` |
| `monitorHistory` | `GET /monitor/{id}/history` |
| `monitorSnapshot` | `GET /monitor/{id}/snapshots/{snapshotId}` |
| `checkMonitor` | `POST /monitor/{id}/check` |
| `monitorDeliveries` | `GET /monitor/{id}/deliveries` |
| `replayMonitorDelivery` | `POST /monitor/{id}/deliveries/{deliveryId}/replay` |
| `listProviders` | `GET /providers` |
| `saveProvider` | `PUT /providers/{provider}` |
| `removeProvider` | `DELETE /providers/{provider}` |
| `health` | `GET /health` |

Every method accepts a trailing `AbortSignal` (except `interactLiveStreamUrl`, which makes no request).
