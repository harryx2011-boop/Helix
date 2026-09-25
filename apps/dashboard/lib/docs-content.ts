import type { Endpoint } from './endpoints';
import type { FailureReason } from './api';
import { endpointById, EXAMPLE_REQUEST, ENDPOINTS } from './catalog';
import { generateCode } from './codegen';
import { mcpToolName } from './mcp-tool-names';

export interface EndpointDocs {
  id: Endpoint;
  purpose: string;
  whenToUse: string;
  responseShape: string;
  failureReasons: FailureReason[];
}

const ALL_FAILURE_REASONS: FailureReason[] = [
  'blocked',
  'challenge',
  'timeout',
  'dns',
  'tls',
  'http_error',
  'empty',
  'robots_denied',
  'unsupported_type',
  'service_unavailable',
];

/**
 * Purpose / when-to-use / response-shape / failure reasons per endpoint — the
 * single source for both `/docs/[slug]` and the generated SKILL.md (WEBSITE.md
 * §9.3), so the two surfaces cannot drift from each other.
 */
export const ENDPOINT_DOCS: Partial<Record<Endpoint, EndpointDocs>> = {
  scrape: {
    id: 'scrape',
    purpose: 'Read one URL and return it as markdown, sanitised or raw HTML, text, links, a screenshot, schema-shaped JSON or citation-ready chunks. One request, any combination of formats.',
    whenToUse: 'Reach for Scrape whenever you already have the URL. Use Search when you only have a query, Crawl when you need a whole site, Parse when the input is a file you are uploading, and Interact when the page needs clicks or typing across several calls before it can be read. For `json`, send a JSON Schema in `jsonOptions` and optionally pick `provider` and `model` per request; the key must already be configured on the instance. `proxy` takes `auto`, `stealth`, `none` or your own `{ url }`; `mobile: true` renders the phone layout.',
    responseShape: '`{ success: true, data: { markdown, html, rawHtml, text, links, screenshot, json, chunks, metadata }, warnings, usage }` where only requested formats are present, `warnings` is always an array, and `usage` (model, tokens, blocks kept) appears only when a model ran. A format that failed after the page was read comes back `null` with a warning naming it. Otherwise `{ success: false, failure: { reason, detail, statusCode, detectedBy, tier, tiersAttempted, profile, escalationAvailable }, warnings }` inside a 200; a 400 means the request itself was wrong (`invalid_request`, `invalid_schema`, `proxy_unavailable`).',
    failureReasons: ALL_FAILURE_REASONS,
  },
  metadata: {
    id: 'metadata',
    purpose:
      'Report what a file discloses about the person and machine that made it — EXIF and GPS in images, XMP, PDF DocInfo, Office docProps — and return a copy with that removed. Send the file as a multipart `file` part or point at a `url` and Helix fetches it first.',
    whenToUse:
      'Reach for Metadata when the question is what a file reveals rather than what it says: EXIF and GPS in a photo, XMP, PDF DocInfo, Office docProps (core, app and custom). `POST /v1/metadata` reports and changes nothing; `POST /v1/metadata/scrub` answers with the cleaned file as the response body and puts the report in the `X-Helix-Metadata-Report` header, so you can stream it straight to disk. Findings are sorted worst-first and carry a `risk` band set from the key and raised — never lowered — when the value itself looks like an email address or a home-directory path. Read `retained` before treating a scrubbed file as clean: some entries cannot be dropped without corrupting the file, and those are reported rather than silently kept.',
    responseShape:
      "`{ success, data: { findings: [{ group, key, value, risk, category, removable }], riskSummary: { high, medium, low }, metadata: { filename, fileType, sizeBytes, contentHash, sourceUrl } }, warnings }` on scan. Scrub answers with the file bytes plus a `MetadataScrubReport` header carrying `removed`, `retained`, `riskSummary` and byte counts. A remote fetch problem, an unsupported type or a corrupt file is `{ success: false, failure: { reason, detail } }`; a file over the operator's upload ceiling is HTTP 413.",
    failureReasons: ['unsupported_type', 'http_error', 'dns', 'tls', 'timeout', 'empty', 'service_unavailable'],
  },
  document: {
    id: 'document',
    purpose:
      'One endpoint over every document operation: parse a file to markdown or schema-shaped JSON, report what it discloses about its author and tooling, or assess its text layer before spending on OCR. Send the file as a multipart `file` part or point at a `url` and Helix fetches it first.',
    whenToUse:
      'Reach for Document whenever the input is a file rather than a page — PDF, DOCX, PPTX or XLSX. Pick the operation with `op`: `parse` for content, `metadata` for disclosure (and `metadata/scrub` for a cleaned copy), `assess` for a text-layer verdict before committing to OCR. Use Scrape for HTML pages; Document refuses them with `unsupported_type`. `ocr: auto` runs OCR only when the text layer is missing or garbled. The same file sent twice is read once, keyed by content hash, whichever operation asks for it.',
    responseShape:
      "`{ success, data: { op, ...operation fields, metadata: { filename, pageCount, fileType, ocrUsed, needsOcr, parser, sizeBytes, contentHash, sourceUrl, fromCache } }, warnings }`. The operation's own fields vary: `parse` returns `markdown`/`json`, `metadata` returns `findings`/`riskSummary`, `assess` returns `needsOcr`/`textLayerQuality`. A remote fetch problem, an unsupported type or an unreachable parser is `{ success: false, failure: { reason, detail, statusCode } }`; a file over the operator's upload ceiling is HTTP 413.",
    failureReasons: ['unsupported_type', 'http_error', 'dns', 'tls', 'timeout', 'empty', 'service_unavailable'],
  },
  extract: {
    id: 'extract',
    purpose:
      'Turn one or more URLs into typed rows against a JSON Schema you supply or a plain-language description Helix designs a schema from. Every returned field carries the source span it was read from, and any field the source does not support is dropped rather than guessed.',
    whenToUse:
      "Reach for Extract when you want data, not documents — the same shape across a set of pages, as a table. Pass `schema` when you already have one, or `prompt` to have `/v1/agent/schema` design one you can keep and reuse. Use Scrape with `jsonOptions` for a single page you are already reading; use Extract when the same shape applies across a URL set. Fields that cannot be traced to a span in the source come back in `dropped` with a reason, so an incomplete answer is visible rather than silently invented.",
    responseShape:
      '`{ success, data: [ { ...schema fields, _source: { url, span: [start, end] } } ], dropped: [ { field, reason } ], warnings, usage }`. `data` is one row per successfully extracted object, `dropped` names every field discarded for want of grounding, and `usage` (model, tokens, blocks kept) appears when a model ran. A request whose schema is invalid is HTTP 400 (`invalid_schema`); a page that could not be read is reported per URL in `warnings` rather than failing the call.',
    failureReasons: ['blocked', 'challenge', 'timeout', 'dns', 'tls', 'http_error', 'empty', 'robots_denied', 'service_unavailable'],
  },
  screenshot: {
    id: 'screenshot',
    purpose:
      'Capture a URL as an image or PDF: the full page, just the viewport, or a single element. PNG, JPEG, WebP or PDF, at any viewport size and device pixel ratio, with ads and consent dialogs blocked out of the frame.',
    whenToUse:
      'Reach for Screenshot when you want the page as it renders rather than as it responds. `fullPage` captures below the fold; `selector` captures one element; omit both for the viewport. Set `viewport` for device size and `dpr` for retina output, `format` and `quality` for the encoding, and `pdf: true` to get a paginated PDF instead of an image. `blockAds` removes ad and consent-dialog chrome, `darkMode` emulates the dark colour scheme, and `omitBackground` yields transparency where the page allows it. `waitFor` holds for a delay or a selector so animations and lazy images settle before the shutter. Scrape with `formats: [screenshot]` returns the same image alongside other formats; this endpoint is the fast path when the image is all you want.',
    responseShape:
      "`{ success, data: { screenshot, width, height, format, bytes, metadata: { statusCode, tier, devicePixelRatio } }, warnings }` where `screenshot` is a URL to the stored capture. Otherwise `{ success: false, failure: { reason, detail, statusCode, tier, tiersAttempted } }` inside a 200; a 400 means the request itself was wrong. A `selector` that matches nothing is `empty`.",
    failureReasons: ['blocked', 'challenge', 'timeout', 'dns', 'tls', 'http_error', 'empty', 'robots_denied', 'service_unavailable'],
  },
  parse: {
    id: 'parse',
    purpose: 'Convert a document (PDF, DOCX, PPTX, XLSX) into markdown, and optionally into JSON against a schema or prompt, in the same envelope Scrape returns for web pages. Send the file as a multipart `file` part or point at a `url` and Helix fetches it first.',
    whenToUse: 'Reach for Parse when the input is a file: an upload from your own system, or a URL that serves a document rather than a page. Use Scrape for HTML pages (Parse refuses them with `unsupported_type` and says so). `ocr: auto` runs OCR only when the text layer is missing or garbled; `force` and `off` override that call. The same file sent twice parses once, keyed by content hash.',
    responseShape: '`{ success, data: { markdown, json, usage, metadata: { filename, pageCount, fileType, ocrUsed, needsOcr, suspectedGarbledText, parser, sizeBytes, contentHash, sourceUrl, fromCache } }, warnings }` on success. A remote fetch problem, an unsupported type or an unreachable parser is `{ success: false, failure: { reason, detail, statusCode } }`; a file over the operator\'s upload ceiling is HTTP 413. A missing `jsonOptions` with `formats: [json]` is HTTP 400.',
    failureReasons: ['unsupported_type', 'http_error', 'dns', 'tls', 'timeout', 'empty', 'service_unavailable'],
  },
  search: {
    id: 'search',
    purpose: 'Search the web and read every result in the same call, instead of searching then scraping each URL yourself. The backend is yours: a self-hosted SearXNG instance, or a Serper or SerpAPI key.',
    whenToUse: 'Reach for Search when you have a query, not a URL. Omit `scrapeOptions` to get url, title and description only; set it to read each page with the same formats Scrape offers. Once you have the URL you want, a direct Scrape call is cheaper for that one page. Narrow with `lang`, `country` and `tbs` (qdr:d, qdr:w, qdr:m, qdr:y) instead of a second request.',
    responseShape: '`{ success, data: { web: [{ url, title, description, position, markdown, metadata }] }, warnings, metadata: { backend, fromCache } }`. A result page that cannot be read keeps its row with a typed `failure` and adds a line to `warnings`; the search itself still succeeds. No backend configured is a 503 `search_unavailable`; a backend error is a 502 `search_failed`.',
    failureReasons: ['blocked', 'challenge', 'timeout', 'dns', 'tls', 'http_error', 'empty', 'service_unavailable'],
  },
  map: {
    id: 'map',
    purpose:
      "List a site's URLs without reading any of them. Reads the sitemap, follows links from the starting page, and returns the set it found. Nothing is scraped, so a map costs a fraction of a crawl.",
    whenToUse:
      'Reach for Map when you want to know what exists before deciding what to read: sizing a crawl, auditing coverage, or picking the handful of pages you actually want. Follow it with Scrape for the pages you choose, or Crawl when you want everything under a path. `sitemap` controls where URLs come from: `include` reads it alongside link discovery, `only` trusts it alone, `skip` ignores it. `search` is a plain substring filter over url, title and description, not a relevance ranking. Set `ignoreQueryParameters: false` to keep `?page=2` and `?page=3` apart.',
    responseShape:
      '`{ success, links: [{ url }], truncated }`. `truncated` is true when more URLs were found than `limit` allowed, so raise `limit` (up to 100000) to see the rest. `title` and `description` are typed on a link but are not populated by this route today. A malformed body is a 400 `invalid_request` naming the offending `field`.',
    failureReasons: ['blocked', 'timeout', 'dns', 'tls', 'http_error', 'service_unavailable'],
  },
  crawl: {
    id: 'crawl',
    purpose: 'Discover and read every page under a starting URL, with depth, page-count and glob path controls. Asynchronous: the call returns a job id, and pages arrive as the crawl walks the site. Pass `estimate: true` to see the projected page count before anything is fetched.',
    whenToUse: 'Reach for Crawl when you need many pages from one site and do not have their URLs ahead of time. For a single page, use Scrape. To list URLs without reading them, use Map. If you only need to know when pages change later, Monitor is the better fit once it ships.',
    responseShape: 'Start: `202 { success, id, jobId, url }` where `url` is `/v1/crawl/{jobId}`. Poll `GET /v1/crawl/{jobId}`: `{ status, total, completed, failed, data: [{ url, markdown, metadata }], next, usage }`, `status` one of `queued | running | completed | failed | cancelled`; follow `next` for the remaining pages. `DELETE /v1/crawl/{jobId}` cancels and keeps finished results. With `webhook` set, `started`, `page`, `completed` and `failed` events are POSTed with retries.',
    failureReasons: ['robots_denied', 'blocked', 'challenge', 'timeout', 'http_error', 'service_unavailable'],
  },
  interact: {
    id: 'interact',
    purpose: 'Drive a stateful browser session: navigate, click, type, press, scroll, wait, screenshot, run JavaScript, then extract with your model. With `keepSessionOpen`, the next call continues on the same live page.',
    whenToUse: 'Reach for Interact when reading the page requires acting on it first (a login wall, a search box, a feed that loads on scroll) or when one call has to build on the last. If a single scripted sequence before one read is enough, Scrape with `actions` is cheaper. Sessions are bounded by the operator: a cap on open sessions, an idle timeout and a hard timeout.',
    responseShape: '`{ success, sessionId, sessionOpen, url, output, data, screenshot, javascriptReturns, actionsRun, usage, timingMs }`, plus `liveViewUrl`, `expiresAt` and `idleExpiresAt` while the session is open. On failure `{ success: false, sessionId, sessionOpen, failure: { reason, detail, actionIndex, actionType } }`; `actionIndex` is `null` when the initial navigation failed. Open a session without acting via `POST /v1/interact/session`; close one with `DELETE /v1/interact/session/{sessionId}`.',
    failureReasons: ['timeout', 'blocked', 'challenge', 'http_error', 'dns', 'tls', 'unsafe_url', 'session_closed', 'service_unavailable'],
  },
  monitor: {
    id: 'monitor',
    purpose: 'Watch one URL on a cron schedule and get a word, line or character diff when it changes. Unchanged checks store no snapshot and send nothing; `sensitivity: significant` ignores timestamps and tracking noise, and keyword triggers narrow it further without a model call.',
    whenToUse: 'Reach for Monitor when you need to know about future changes, not the current state. For a one-time read, use Scrape. For many pages at once, create one monitor per URL; a monitor watches a single page.',
    responseShape: 'Create: `{ success, id, monitorId, status, nextCheckAt, schedule, stats }` (201). History: `GET /v1/monitor/{id}/history` returns `{ entries: [{ checkedAt, changed, reason, diff, snapshotUrl }], next }`. Webhooks post `{ event, monitorId, url, checkedAt, changed, diff, snapshot, previousSnapshot }` signed with `Helix-Signature`.',
    failureReasons: ['blocked', 'challenge', 'timeout', 'dns', 'tls', 'http_error', 'empty', 'robots_denied', 'service_unavailable'],
  },
};

/** Sections offered by the docs index and the SKILL.md generator (WEBSITE.md §9.3). */
export function docsEndpointList() {
  return ENDPOINTS.filter((e) => e.product);
}

/** curl example for an endpoint, used by both `/docs/[slug]` and SKILL.md. */
export function docsCurlExample(id: Endpoint, apiKey?: string): string {
  const body = EXAMPLE_REQUEST[id];
  return generateCode('curl', { endpoint: id, body, ...(apiKey ? { apiKey } : {}) });
}

export function docsEndpointOrThrow(id: string) {
  const def = endpointById(id);
  const docs = ENDPOINT_DOCS[id as Endpoint];
  if (!def || !docs) return undefined;
  return { def, docs };
}

/* ------------------------------------------------------------------------- */
/* Agent surfaces (WEBSITE.md §9): MCP, CLI, Skills.                          */
/*                                                                            */
/* Plain strings, no JSX, so `/docs/[slug]`, the `.md` twins and the docs     */
/* index all render the same words. Backticks mark inline code.               */
/* ------------------------------------------------------------------------- */

export type AgentSurfaceSlug = 'mcp' | 'cli' | 'skills';

export interface DocSectionContent {
  title: string;
  body: string;
  code?: { label: string; text: string };
}

export interface AgentSurfaceDocs {
  slug: AgentSurfaceSlug;
  title: string;
  /** One line for the docs index card and the markdown frontmatter. */
  summary: string;
  sections: DocSectionContent[];
}

/** The tool name for every endpoint whose route is live; the MCP server derives the same names from openapi.yaml operationIds. */
export function liveMcpToolNames(): string[] {
  return ENDPOINTS.filter((e) => e.status === 'live').map((e) => mcpToolName(e.id));
}

const CLI_COMMAND = 'npx -y @helix/cli@latest init --all -k helix-YOUR_KEY';

export function agentSurfaceDocs(opts: { mcpUrl: string; siteUrl: string }): Record<AgentSurfaceSlug, AgentSurfaceDocs> {
  const mcpUrl = opts.mcpUrl;
  const site = opts.siteUrl.replace(/\/$/, '');
  const toolNames = liveMcpToolNames();

  return {
    mcp: {
      slug: 'mcp',
      title: 'MCP',
      summary: 'Connect an MCP client to the live endpoints as tools, generated from openapi.yaml.',
      sections: [
        {
          title: 'Connect',
          body: `The API serves MCP over streamable HTTP at \`/mcp\`, on the same host as the REST API (\`${mcpUrl}\`). It takes the same bearer key as every other request; there is no separate login.`,
          code: {
            label: 'claude mcp add',
            text: generateCode('mcp', { endpoint: 'scrape', body: EXAMPLE_REQUEST.scrape, mcpUrl }),
          },
        },
        {
          title: 'Tools',
          body: `Tools are generated from openapi.yaml by the running server, one per operation the running server actually serves: ${toolNames.map((n) => `\`${n}\``).join(', ')}, plus \`helix_get_job\`, \`helix_cancel_job\` and \`helix_get_job_errors\` for asynchronous work and \`helix_health\`. Each tool's description and input schema are the spec's own, with references inlined, so what an agent reads is what the HTTP endpoint accepts. A path that exists in the spec but has no route yet produces no tool. Every listed schema is loaded into the agent's context on connect, so an operator can trim the list with \`HELIX_MCP_TOOLS\` (comma-separated tool names); unset exposes every live operation.`,
        },
        {
          title: 'Calls',
          body: 'A tool call is the HTTP request. It passes through the same key check, rate limit and request validation, and returns the same envelope: `{ success: true, data }` or `{ success: false, failure: { reason, signals } }`. A request the API rejects (400, 401, 404, 429) comes back as a tool error carrying the API\'s JSON body, so the agent sees the field and the reason rather than a bare status.',
        },
        {
          title: 'Other clients',
          body: `Cursor reads \`~/.cursor/mcp.json\`, Codex \`~/.codex/config.toml\`, Windsurf \`~/.codeium/windsurf/mcp_config.json\`. The connect sheet on the Overview page prints the exact entry for each with your key filled in, and \`helix init\` writes them for you.`,
          code: { label: '~/.cursor/mcp.json', text: JSON.stringify({ mcpServers: { helix: { url: mcpUrl, headers: { Authorization: 'Bearer helix-YOUR_KEY' } } } }, null, 2) },
        },
      ],
    },
    cli: {
      slug: 'cli',
      title: 'CLI',
      summary: 'One command writes the MCP config and your SKILL.md into every agent harness it finds.',
      sections: [
        {
          title: 'Install',
          body: '`@helix/cli` is a connector: it detects installed agent harnesses and writes their MCP config plus your SKILL.md. v0.1 ships `init` only; `helix scrape` and friends are deferred. The package is not on npm yet; until it is, build it from a checkout with `pnpm --filter @helix/cli build` and run `node packages/cli/dist/bin.js` in place of `npx -y @helix/cli@latest`.',
          code: { label: 'terminal', text: CLI_COMMAND },
        },
        {
          title: 'What it writes',
          body: 'Claude Code: `~/.claude.json` and `~/.claude/skills/helix/SKILL.md`. Cursor: `~/.cursor/mcp.json` and `~/.cursor/skills/helix/SKILL.md`. Codex: `~/.codex/config.toml` and `~/.codex/skills/helix/SKILL.md`. Windsurf: `~/.codeium/windsurf/mcp_config.json` and `~/.codeium/windsurf/skills/helix/SKILL.md`. Existing entries in each file are kept; only the `helix` server entry is replaced.',
        },
        {
          title: 'Flags',
          body: '`--all` configures every detected harness; `--client <id>` (repeatable: `claude-code`, `cursor`, `codex`, `windsurf`) picks specific ones. `-k <key>` or `HELIX_API_KEY` supplies the key. `--browser` opens the connect page in the app instead of taking a key. `--mcp-url` and `--site-url` point a self-hosted instance at itself. `--no-skill` writes MCP config only; `--dry-run` prints the plan without touching a file.',
          code: { label: 'self-hosted', text: `${CLI_COMMAND} --mcp-url ${mcpUrl} --site-url ${site}` },
        },
      ],
    },
    skills: {
      slug: 'skills',
      title: 'Skills',
      summary: 'A generated SKILL.md, scoped to the endpoints you selected, ready for an agent to follow.',
      sections: [
        {
          title: 'SKILL.md',
          body: 'The SKILL.md covers every endpoint. It opens with auth, the base URL, the rate-limit headers and `estimate: true`, then gives one section per endpoint: purpose, when to reach for it versus a sibling, the request and response shapes from openapi.yaml, a curl with your key, and every typed failure reason with what to do about it.',
        },
        {
          title: 'Where it lives',
          body: `It is served, keyless, at \`${site}/agent-onboarding/SKILL.md\` — View and Copy on the Overview page, and what \`helix init\` fetches.`,
          code: { label: 'curl', text: `curl ${site}/agent-onboarding/SKILL.md` },
        },
        {
          title: 'Placement',
          body: '`helix init` writes the file to each harness\'s skills directory (`~/.claude/skills/helix/SKILL.md`, `~/.cursor/skills/helix/SKILL.md`, `~/.codex/skills/helix/SKILL.md`, `~/.codeium/windsurf/skills/helix/SKILL.md`). Placed by hand, any directory the harness scans for skills works; the file is self-contained.',
        },
      ],
    },
  };
}

export const AGENT_SURFACE_SLUGS: readonly AgentSurfaceSlug[] = ['mcp', 'cli', 'skills'];

export function isAgentSurfaceSlug(slug: string): slug is AgentSurfaceSlug {
  return (AGENT_SURFACE_SLUGS as readonly string[]).includes(slug);
}

/* ------------------------------------------------------------------------- */
/* Reference pages: api-reference, sdks, agents.                              */
/*                                                                            */
/* Same plain-string DocSectionContent shape as agentSurfaceDocs, rendered by */
/* the same StaticShell + ContentSection pair in `/docs/[slug]`.              */
/* ------------------------------------------------------------------------- */

export type ReferenceSlug = 'api-reference' | 'sdks' | 'agents';

export interface ReferenceDoc {
  slug: ReferenceSlug;
  title: string;
  summary: string;
  sections: DocSectionContent[];
  /** Rendered as a distinct list, not folded into a paragraph — api-reference only. */
  endpointRows?: { method: string; path: string; productName: string; tagline: string; docHref: string }[];
}

export const REFERENCE_SLUGS: readonly ReferenceSlug[] = ['api-reference', 'sdks', 'agents'];

export function isReferenceSlug(slug: string): slug is ReferenceSlug {
  return (REFERENCE_SLUGS as readonly string[]).includes(slug);
}

/** The six live endpoints, method + path + auth, one line each, linking to their own doc page. */
export function apiReferenceDoc(): ReferenceDoc {
  const endpoints = docsEndpointList();
  return {
    slug: 'api-reference',
    title: 'API Reference',
    summary: 'Every live endpoint, its method, path and auth header, in one page.',
    sections: [
      {
        title: 'Auth',
        body: 'Every request carries `Authorization: Bearer helix-YOUR_KEY`. One key authenticates you to this Helix instance; it is unrelated to the LLM, proxy or vector-store credentials an operator sets in their own environment. Base URL is `https://api.helix.dev` hosted, or `http://localhost:7400` on a default self-host.',
      },
      {
        title: 'Async jobs',
        body: 'Crawl and Monitor return a job id immediately (`202` or `201`) instead of blocking. Poll `GET /v1/{crawl|batch/scrape}/{jobId}` or `GET /v1/jobs/{id}`; `DELETE` cancels and keeps finished results. Pass `webhook` on the create call to receive `started`, `page`, `completed` and `failed` events instead of polling.',
      },
      {
        title: 'Failures inside 200',
        body: 'A blocked page, a bot challenge or a timeout is `{ success: false, failure: { reason, detail } }` inside an HTTP 200, not a thrown error — Helix distinguishes a target that refused to be read from a malformed request (`400`) or a missing key (`401`). Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.',
      },
    ],
    endpointRows: endpoints.map((e) => ({ method: e.method, path: e.path, productName: e.productName, tagline: e.tagline, docHref: `/docs/${e.id}` })),
  };
}

const SDK_CURL = `curl -X POST https://api.helix.dev/v1/scrape \\
  -H "Authorization: Bearer helix-YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com"}'`;

const SDK_FETCH = `const r = await fetch("https://api.helix.dev/v1/scrape", {
  method: "POST",
  headers: { Authorization: "Bearer helix-YOUR_KEY", "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com" }),
});
console.log(await r.json());`;

const SDK_PYTHON = `import requests

r = requests.post(
    "https://api.helix.dev/v1/scrape",
    headers={"Authorization": "Bearer helix-YOUR_KEY"},
    json={"url": "https://example.com"},
)
print(r.json())`;

/** Honest state: sdk-ts is an empty package, @helix/cli is unpublished. Plain HTTP is what works today. */
export function sdksDoc(): ReferenceDoc {
  return {
    slug: 'sdks',
    title: 'SDKs',
    summary: 'No typed SDK is published yet. Helix is a plain HTTP API — cURL, fetch and requests all work today.',
    sections: [
      {
        title: 'Current state',
        body: '`packages/sdk-ts` exists in the monorepo as an empty package and has not been published to npm. `@helix/cli` is written and buildable from source but is also not on npm yet — see `/docs/agents` for how to run it from a checkout. Treat every mention of a Helix SDK elsewhere as forward-looking, not available today.',
      },
      {
        title: 'What works right now',
        body: 'Helix is a plain JSON-over-HTTP API with one bearer header. Any HTTP client reaches every endpoint; nothing in the response envelope requires a generated client to parse.',
        code: { label: 'cURL', text: SDK_CURL },
      },
      {
        title: 'fetch (TypeScript / JavaScript)',
        body: 'The same request with the platform `fetch`, no dependency added.',
        code: { label: 'fetch', text: SDK_FETCH },
      },
      {
        title: 'requests (Python)',
        body: 'The same request with `requests`, the most common HTTP client in the Python ecosystem.',
        code: { label: 'requests', text: SDK_PYTHON },
      },
      {
        title: 'Full request and response shapes',
        body: 'See `/docs/api-reference` for every endpoint, or the raw `openapi.yaml` at the repository root, which is the single source of truth this page and the generated MCP tools both read from.',
      },
    ],
  };
}

/** Index over the three agent surfaces (MCP, CLI, Skills), linking onward to each. */
export function agentsIndexDoc(): ReferenceDoc {
  return {
    slug: 'agents',
    title: 'MCP · CLI · Skills',
    summary: 'Three ways an agent harness reaches Helix: the MCP server, the CLI connector, and a generated SKILL.md.',
    sections: [
      {
        title: 'MCP server',
        body: 'Helix serves MCP over streamable HTTP at `/mcp`, on the same host and the same bearer key as the REST API. Tools are generated from `openapi.yaml`, one per live endpoint (`helix_scrape`, `helix_crawl`, and so on), plus job and health tools. Full detail on `/docs/mcp`.',
      },
      {
        title: 'CLI connector',
        body: '`@helix/cli` detects installed agent harnesses (Claude Code, Cursor, Codex, Windsurf) and writes their MCP config plus a SKILL.md in one command: `npx -y @helix/cli@latest init --all -k helix-YOUR_KEY`. Not yet published to npm — build it from a checkout with `pnpm --filter @helix/cli build` and run `node packages/cli/dist/bin.js init --all -k helix-YOUR_KEY` in its place. Full detail on `/docs/cli`.',
        code: { label: 'terminal', text: 'npx -y @helix/cli@latest init --all -k helix-YOUR_KEY' },
      },
      {
        title: 'SKILL.md',
        body: 'A skill file covering every endpoint: auth, base URL, rate-limit headers, and one section per endpoint with its request, response and failure reasons. `helix init` places it directly in each harness\'s skills directory. Full detail on `/docs/skills`.',
      },
    ],
  };
}
