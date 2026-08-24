import type { EndpointDef } from './catalog';
import { EXAMPLE_REQUEST } from './catalog';
import { generateCode } from './codegen';
import type { FailureReason } from './api';

/**
 * SKILL.md generator (WEBSITE.md §9.3). Pure — no IO, no auth, no Supabase.
 * Callers (the onboarding API and the public agent-onboarding page) supply the
 * endpoint list, an optional key and the URLs.
 */

const FAILURE_REASON_NOTES: Record<FailureReason, string> = {
  blocked: 'The target actively blocked the request (WAF, bot-detection). Retry with a higher tier or a different profile before giving up.',
  challenge: 'A JS challenge or CAPTCHA was served. Escalate to a browser tier; if it persists, the site is not scrapable without human input.',
  timeout: 'The page did not finish loading in time. Raise `timeout` or retry; persistent timeouts point at a slow or unstable target.',
  dns: "The hostname didn't resolve. Check the URL for typos before retrying — retrying an unresolvable host wastes a call.",
  tls: 'The TLS handshake failed. Usually a target-side certificate issue, not something a retry fixes.',
  http_error: 'The target returned a non-2xx status. Check `statusCode` in the failure body before treating it as transient.',
  empty: 'The page loaded but produced no usable content. Try a different `extractor` or check `onlyMainContent`.',
  robots_denied: 'robots.txt disallows this path. Helix will not override robots; this is not retryable.',
  unsupported_type: 'The content type is not one Helix can process (e.g. binary the parser does not handle).',
  service_unavailable: 'A Helix-side dependency was unreachable. Not the target site — safe to retry.',
};

const FAILURE_REASONS = Object.keys(FAILURE_REASON_NOTES) as FailureReason[];

export interface GenerateSkillOptions {
  endpoints: readonly EndpointDef[];
  apiKey?: string;
  baseUrl: string;
  mcpUrl: string;
}

/** One file: a preamble, then one section per selected endpoint (WEBSITE.md §9.3). */
export function generateSkillMarkdown(opts: GenerateSkillOptions): string {
  const { endpoints, apiKey, baseUrl, mcpUrl } = opts;
  const parts: string[] = [preamble(baseUrl, apiKey)];
  for (const endpoint of endpoints) {
    parts.push(endpointSection(endpoint, { ...(apiKey !== undefined ? { apiKey } : {}), baseUrl, mcpUrl }));
  }
  return parts.join('\n');
}

function preamble(baseUrl: string, apiKey?: string): string {
  const key = apiKey ?? 'helix-YOUR_KEY';
  return `---
name: helix
description: Fetch, parse, search, crawl, interact with and monitor the live web through the Helix API. Reach for this whenever a task needs current web content rather than training data.
---

# Helix

Base URL: \`${baseUrl}\`

Every request carries \`Authorization: Bearer ${key}\`.

Every response is JSON with either \`{"success": true, "data": {...}, "warnings": [...]}\` or \`{"success": false, "failure": {"reason": ..., "signals": [...]}, "warnings": [...]}\`. A non-2xx status means the request itself was malformed or unauthorized, not that the fetch failed — a failed fetch is still a 200 with \`success: false\`.

\`null\` is a real answer, not a missing one: a field that legitimately has no value comes back \`null\` with a reason alongside it, never omitted silently.

Rate limits are reported on every response via \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` and \`X-RateLimit-Reset\` headers. Back off when \`X-RateLimit-Remaining\` reaches 0.

Any request that supports \`estimate: true\` returns a cost and time estimate instead of running — use it before a large crawl or monitor job.
`;
}

function endpointSection(endpoint: EndpointDef, ctx: { apiKey?: string; baseUrl: string; mcpUrl: string }): string {
  const heading = `\n## ${endpoint.name}\n\n`;

  if (endpoint.status === 'coming') {
    return `${heading}${endpoint.tagline}\n\nNot yet available — this endpoint is not shipped yet. Do not call \`${endpoint.path}\`.\n`;
  }

  const body = EXAMPLE_REQUEST[endpoint.id];
  const curl = generateCode('curl', { endpoint: endpoint.id, body, ...(ctx.apiKey !== undefined ? { apiKey: ctx.apiKey } : {}), baseUrl: ctx.baseUrl, mcpUrl: ctx.mcpUrl });
  const successEnvelope = JSON.stringify({ success: true, data: exampleDataShape(endpoint.id), warnings: [] }, null, 2);
  const failureEnvelope = JSON.stringify({ success: false, failure: { reason: 'blocked', signals: ['string[]'] }, warnings: [] }, null, 2);

  const notes = requestNotes(endpoint);

  return `${heading}${endpoint.tagline}

**Reach for this when** ${reachWhen(endpoint)}
**Not when** ${reachNotWhen(endpoint)}

Request: \`${endpoint.method} ${endpoint.path}\`
${notes ? `\n${notes}\n` : ''}
\`\`\`bash
${curl}
\`\`\`

Success response:

\`\`\`json
${successEnvelope}
\`\`\`

Failure response:

\`\`\`json
${failureEnvelope}
\`\`\`

Failure reasons:

${FAILURE_REASONS.map((reason) => `- \`${reason}\` — ${FAILURE_REASON_NOTES[reason]}`).join('\n')}
${lifecycleNotes(endpoint)}`;
}

/** Endpoints that do not finish inline need their poll/cancel loop spelled out. */
function lifecycleNotes(endpoint: EndpointDef): string {
  if (endpoint.id !== 'crawl') return '';
  return `
Lifecycle:

- The call answers \`202\` with \`{ "success": true, "id": "<jobId>", "jobId": "<jobId>", "url": "/v1/crawl/<jobId>" }\`; the crawl runs in the background.
- Poll \`GET /v1/crawl/<jobId>\`. \`status\` is \`queued\`, then \`running\`, then \`completed\`, \`failed\` or \`cancelled\`. \`data\` holds the pages read so far, each \`{ url, markdown, metadata }\`; follow \`next\` until it is absent.
- \`DELETE /v1/crawl/<jobId>\` cancels a queued or running crawl and keeps what was already read.
- Per-page failures do not fail the job; read them at \`GET /v1/jobs/<jobId>/errors\`.
- \`includePaths\` and \`excludePaths\` are globs over the path (\`/blog/*\`); exclusion wins. \`limit\` and \`maxDepth\` are capped by the operator, and a request above the cap is rejected.
- Set \`webhook\` to a URL to receive \`started\`, \`page\`, \`completed\` and \`failed\` events instead of polling.
`;
}

/** Parameter notes an agent needs to form a correct request. Only for endpoints whose contract is settled. */
function requestNotes(endpoint: EndpointDef): string | undefined {
  switch (endpoint.id) {
    case 'scrape':
      return [
        '- `formats`: any of `markdown` (default), `html` (sanitised), `rawHtml`, `text`, `links`, `screenshot`, `json`, `chunks`. Only requested formats appear in `data`.',
        '- `json` needs `jsonOptions.schema` (a JSON Schema). `prompt` may accompany it; `provider` and `model` override the instance default per request. Do not use `minItems`/`maxItems`; they are rejected.',
        '- `tier`: `auto` (default) escalates plain → tls → lightpanda → chromium on evidence. Set it only to pin one tier.',
        '- `mobile: true` renders the phone layout and forces Chromium. `actions` (click, write, press, scroll, wait, screenshot, executeJavascript) also force Chromium.',
        '- `proxy`: `auto` (instance proxy if configured), `stealth` (instance proxy required), `none`, or `{ url, sessionId, geo }` for your own.',
        '- On success, `usage` is present only when a model ran. A `null` format value plus a `warnings` entry means that step failed after the page was read.',
      ].join('\n');
    default:
      return undefined;
  }
}

function reachWhen(endpoint: EndpointDef): string {
  switch (endpoint.id) {
    case 'scrape':
      return 'you have one specific URL and need its content as markdown, JSON, or a screenshot.';
    case 'parse':
      return 'the source is a document file (PDF, DOCX, PPTX, XLSX) rather than a web page — upload it as a multipart `file` part, or pass a `url` that serves the file. Add `formats: ["json"]` with `jsonOptions.schema` or `jsonOptions.prompt` for structured fields; leave `ocr` on `auto` unless you know the scan needs forcing.';
    case 'search':
      return "you don't have a URL yet and need to find and read relevant pages in one call. Omit `scrapeOptions` for url, title and description only; set it to read each page. Narrow with `lang`, `country` and `tbs` (qdr:d / qdr:w / qdr:m / qdr:y). A page that cannot be read keeps its row with a `failure` and a `warnings` line; the call still succeeds.";
    case 'crawl':
      return 'you need many pages from one site and do not already have the list of URLs. Send `estimate: true` first to see the projected page count.';
    case 'interact':
      return 'reaching the content requires clicking, typing, or scrolling first — a single fetch will not see it.';
    case 'monitor':
      return 'you need to know when a page changes over time, not just its current state.';
    default:
      return 'this is the right shape for the task.';
  }
}

function reachNotWhen(endpoint: EndpointDef): string {
  switch (endpoint.id) {
    case 'scrape':
      return "the source is a document file (use Parse) or you don't have the URL yet (use Search).";
    case 'parse':
      return 'the source is a live web page (use Scrape; Parse answers `unsupported_type` for HTML) or the file is larger than the instance upload ceiling (HTTP 413).';
    case 'search':
      return 'you already know the exact URL (use Scrape directly instead of searching for it).';
    case 'crawl':
      return "you only need one page (use Scrape) or you're just listing URLs without reading them (use Map).";
    case 'interact':
      return 'a plain fetch already returns the content (use Scrape; Interact costs more and is slower).';
    case 'monitor':
      return 'you only need the current state once (use Scrape; Monitor is for repeated checks).';
    default:
      return 'a sibling endpoint is a better fit for the shape of the request.';
  }
}

function exampleDataShape(id: EndpointDef['id']): Record<string, unknown> {
  switch (id) {
    case 'scrape':
      return { markdown: '...', metadata: { title: '...', sourceUrl: '...', statusCode: 200, tier: 'plain', tiersAttempted: ['plain'] } };
    case 'parse':
      return { markdown: '...', json: {}, metadata: { filename: '...', pageCount: 0, fileType: 'pdf', ocrUsed: false, fromCache: false } };
    case 'search':
      return { web: [{ url: '...', title: '...', description: '...', position: 1, markdown: '...', metadata: { statusCode: 200 } }] };
    case 'map':
      return { urls: ['...'] };
    case 'crawl':
      return { id: '<jobId>', jobId: '<jobId>', url: '/v1/crawl/<jobId>' };
    case 'interact':
      return { sessionId: '...', markdown: '...' };
    case 'monitor':
      return { id: '...', status: 'active' };
    default:
      return {};
  }
}
