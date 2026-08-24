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
  const successEnvelope = JSON.stringify(exampleSuccessEnvelope(endpoint.id), null, 2);
  const failureEnvelope = JSON.stringify(exampleFailureEnvelope(endpoint.id), null, 2);

  return `${heading}${endpoint.tagline}

**Reach for this when** ${reachWhen(endpoint)}
**Not when** ${reachNotWhen(endpoint)}

Request: \`${endpoint.method} ${endpoint.path}\`

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
${endpointNotes(endpoint)}`;
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
      return 'the source is a document file (PDF, DOCX, PPTX, XLSX) rather than a web page.';
    case 'search':
      return "you don't have a URL yet and need to find and read relevant pages in one call.";
    case 'crawl':
      return 'you need many pages from one site and do not already have the list of URLs.';
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
      return "the source is a live web page (use Scrape) — Parse is for uploaded or linked files.";
    case 'search':
      return 'you already know the exact URL (use Scrape directly instead of searching for it).';
    case 'crawl':
      return "you only need one page (use Scrape) or you're just listing URLs without reading them.";
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
    case 'parse':
      return { markdown: '...', metadata: { title: '...', statusCode: 200 } };
    case 'search':
      return { results: [{ url: '...', title: '...', markdown: '...' }] };
    case 'map':
      return { urls: ['...'] };
    case 'crawl':
      return { jobId: '...', status: 'running' };
    case 'interact':
      return { sessionId: '...', markdown: '...' };
    case 'monitor':
      return { id: '...', status: 'active' };
    default:
      return {};
  }
}
