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
  unsafe_url: 'The URL points at the Helix instance or a private network. Only public http(s) addresses open; not retryable.',
  session_closed: 'The interact session was closed (DELETE or timeout) while the run was in progress. Open a new session.',
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

Any request that supports \`estimate: true\` returns a cost and time estimate instead of running — use it before a large crawl.

## Where this file lives

Save it as \`SKILL.md\` under \`.claude/skills/helix/\` (Claude Code, project-local) or \`~/.claude/skills/helix/\` (global); \`.agents/skills/helix/\` or \`~/.agents/skills/helix/\` for Codex, Cursor and other Agent-Skills tools. \`npx -y @helix/cli@latest init --all\` writes it, plus the MCP config, for every harness it finds.

## The key is a secret

Resolve it from \`HELIX_API_KEY\` in your own shell, or from \`.env.local\`. Check for it with a presence test (\`\${HELIX_API_KEY:+set}\`) or an HTTP status code — never print, echo, cat or grep-with-output anything that may contain it, and never paste it into a chat. If it is exposed, revoke it (\`DELETE /v1/keys/{id}\`) and mint a new one.
`;
}

function endpointSection(endpoint: EndpointDef, ctx: { apiKey?: string; baseUrl: string; mcpUrl: string }): string {
  const heading = `\n## ${endpoint.name}\n\n`;

  if (endpoint.status === 'coming') {
    return `${heading}${endpoint.tagline}\n\nNot yet available — this endpoint is not shipped yet. Do not call \`${endpoint.path}\`.\n`;
  }

  const body = EXAMPLE_REQUEST[endpoint.id];
  const curl = generateCode('curl', { endpoint: endpoint.id, body, ...(ctx.apiKey !== undefined ? { apiKey: ctx.apiKey } : {}), baseUrl: ctx.baseUrl, mcpUrl: ctx.mcpUrl });
  const successEnvelope = JSON.stringify(exampleSuccessEnvelope(endpoint.id), null, 2);
  const failureEnvelope = JSON.stringify(exampleFailureEnvelope(endpoint.id), null, 2);

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

${usageNotes(endpoint)}Failure reasons:

${FAILURE_REASONS.map((reason) => `- \`${reason}\` — ${FAILURE_REASON_NOTES[reason]}`).join('\n')}
${lifecycleNotes(endpoint)}${endpointNotes(endpoint)}`;
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

/** Endpoint-specific follow-up calls an agent needs after the first request. */
function usageNotes(endpoint: EndpointDef): string {
  switch (endpoint.id) {
    case 'monitor':
      return `Notes:

- Create returns 201 at once; the first check runs at \`nextCheckAt\`. Checks cannot run more often than the instance minimum (hourly by default), so a faster \`schedule\` is rejected with \`field: schedule\`.
- \`schedule\` is a cron string or \`{ "every": "6h", "timezone": "Europe/London" }\`.
- \`sensitivity: "significant"\` ignores relative timestamps, clock times, dates and tracking parameters. \`trigger.keywordAppears\` / \`trigger.keywordDisappears\` fire only on that phrase.
- Read the timeline with \`GET ${endpoint.path}/{id}/history\` (entries carry \`changed\`, \`reason\`, \`diff\`, \`snapshotUrl\`). \`POST ${endpoint.path}/{id}/check\` runs one check now. \`PATCH\` with \`{ "status": "paused" }\` pauses; \`DELETE\` removes.
- With a \`webhook\`, each change is posted as \`{ event, monitorId, url, checkedAt, changed, diff, snapshot, previousSnapshot }\`, signed in \`Helix-Signature\` when a secret is set, retried with backoff and dead-lettered after ten attempts (\`GET ${endpoint.path}/{id}/deliveries\`).

`;
    default:
      return '';
  }
}

/** Endpoint-specific mechanics an agent needs beyond the envelope. */
function endpointNotes(endpoint: EndpointDef): string {
  if (endpoint.id !== 'interact') return '';
  return `
Sessions:

- Actions: \`navigate\`, \`click\`, \`type\`, \`press\`, \`scroll\`, \`wait\`, \`screenshot\`, \`executeJavascript\`, \`extract\`. Every action names its target with a CSS selector; \`extract\` is the only one that calls a model and returns its answer as \`output\` (an object in \`data\` when you pass a JSON \`schema\`).
- Send \`keepSessionOpen: true\` to get a \`sessionId\` back, then pass \`sessionId\` (and omit \`url\`) to continue on the same page. Pass both to navigate that session somewhere else first.
- \`POST ${endpoint.path}/session\` opens a session without acting; \`DELETE ${endpoint.path}/session/{sessionId}\` closes one. Close sessions you are done with: the operator caps how many can be open, and a \`429 session_limit_reached\` means that cap is full.
- Sessions close on their own after an idle timeout and, whatever happens, at \`expiresAt\`. A \`404\` on a \`sessionId\` means it has gone; open a new one rather than retrying.
- \`409 session_busy\` means another request is running on that session. Wait for it to return.
- \`failure.actionIndex\` says which action failed (\`null\` for the initial navigation). Earlier actions already ran; on a kept session the page is left where it stopped.
- \`liveViewUrl\` is a read-only page a person can open to watch the session. It carries its own token and needs no API key.
`;
}

function exampleSuccessEnvelope(id: EndpointDef['id']): Record<string, unknown> {
  if (id === 'interact') {
    return {
      success: true,
      sessionId: 'sess_...',
      sessionOpen: false,
      url: '...',
      output: '...',
      data: { answer: '...' },
      screenshot: 'data:image/png;base64,...',
      javascriptReturns: [],
      actionsRun: 3,
      usage: { tokens: { input: 0, output: 0 }, model: '...' },
      timingMs: 0,
    };
  }
  return { success: true, data: exampleDataShape(id), warnings: [] };
}

function exampleFailureEnvelope(id: EndpointDef['id']): Record<string, unknown> {
  if (id === 'interact') {
    return {
      success: false,
      sessionId: 'sess_...',
      sessionOpen: false,
      failure: { reason: 'timeout', detail: '...', actionIndex: 1, actionType: 'click' },
    };
  }
  return { success: false, failure: { reason: 'blocked', signals: ['string[]'] }, warnings: [] };
}

function reachWhen(endpoint: EndpointDef): string {
  switch (endpoint.id) {
    case 'scrape':
      return 'you have one specific URL and need its content as markdown, JSON, or a screenshot.';
    case 'parse':
      return 'the source is a document file (PDF, DOCX, PPTX, XLSX) rather than a web page — upload it as a multipart `file` part, or pass a `url` that serves the file. Add `formats: ["json"]` with `jsonOptions.schema` or `jsonOptions.prompt` for structured fields; leave `ocr` on `auto` unless you know the scan needs forcing.';
    case 'metadata':
      return 'you need to know what a file gives away about who and what made it — EXIF and GPS in images, XMP, PDF DocInfo, Office docProps — or you need a copy with that stripped before publishing. `POST /v1/metadata` reports; `POST /v1/metadata/scrub` returns the cleaned file itself as the body, with the report in the `X-Helix-Metadata-Report` header. Findings come back sorted worst-first with a `risk` band.';
    case 'search':
      return "you don't have a URL yet and need to find and read relevant pages in one call. Omit `scrapeOptions` for url, title and description only; set it to read each page. Narrow with `lang`, `country` and `tbs` (qdr:d / qdr:w / qdr:m / qdr:y). A page that cannot be read keeps its row with a `failure` and a `warnings` line; the call still succeeds.";
    case 'crawl':
      return 'you need many pages from one site and do not already have the list of URLs. Send `estimate: true` first to see the projected page count.';
    case 'interact':
      return 'reaching the content requires clicking, typing, or scrolling first, or one call has to build on the page state left by the last.';
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
    case 'metadata':
      return "you want the file's readable content (use Parse; Metadata never returns the document text) or the source is a web page rather than a file.";
    case 'search':
      return 'you already know the exact URL (use Scrape directly instead of searching for it).';
    case 'crawl':
      return "you only need one page (use Scrape) or you're just listing URLs without reading them (use Map).";
    case 'interact':
      return 'a plain fetch already returns the content (use Scrape), or one scripted sequence before a single read is enough (use Scrape with `actions`).';
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
    case 'metadata':
      return {
        findings: [{ group: 'exif', key: 'GPSLatitude', value: '51.507222', risk: 'high', category: 'location', removable: true }],
        riskSummary: { high: 1, medium: 0, low: 0 },
        metadata: { filename: '...', fileType: 'jpg', sizeBytes: 0, contentHash: '...' },
      };
    case 'search':
      return { web: [{ url: '...', title: '...', description: '...', position: 1, markdown: '...', metadata: { statusCode: 200 } }] };
    case 'map':
      return { urls: ['...'] };
    case 'crawl':
      return { id: '<jobId>', jobId: '<jobId>', url: '/v1/crawl/<jobId>' };
    case 'interact':
      return { sessionId: '...', markdown: '...' };
    case 'monitor':
      return { id: '...', monitorId: '...', status: 'active', nextCheckAt: '...', stats: { checks: 0, changes: 0, pagesUnchanged: 0 } };
    default:
      return {};
  }
}
