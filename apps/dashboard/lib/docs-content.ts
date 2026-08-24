import type { Endpoint } from './supabase/types';
import type { FailureReason } from './api';
import { endpointById, EXAMPLE_REQUEST, ENDPOINTS } from './catalog';
import { generateCode } from './codegen';

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
  crawl: {
    id: 'crawl',
    purpose: 'Discover and read every page under a starting URL, with depth, page-count and glob path controls. Asynchronous: the call returns a job id, and pages arrive as the crawl walks the site. Pass `estimate: true` to see the projected page count before anything is fetched.',
    whenToUse: 'Reach for Crawl when you need many pages from one site and do not have their URLs ahead of time. For a single page, use Scrape. To list URLs without reading them, use Map. If you only need to know when pages change later, Monitor is the better fit once it ships.',
    responseShape: 'Start: `202 { success, id, jobId, url }` where `url` is `/v1/crawl/{jobId}`. Poll `GET /v1/crawl/{jobId}`: `{ status, total, completed, failed, data: [{ url, markdown, metadata }], next, usage }`, `status` one of `queued | running | completed | failed | cancelled`; follow `next` for the remaining pages. `DELETE /v1/crawl/{jobId}` cancels and keeps finished results. With `webhook` set, `started`, `page`, `completed` and `failed` events are POSTed with retries.',
    failureReasons: ['robots_denied', 'blocked', 'challenge', 'timeout', 'http_error', 'service_unavailable'],
  },
  interact: {
    id: 'interact',
    purpose: 'Drive a stateful browser session: click, type, scroll, wait, screenshot, run JavaScript, then extract — across multiple calls against the same live page.',
    whenToUse: 'Reach for Interact when reading the page requires acting on it first — a login wall, a search box, an infinite-scroll feed. If the page is readable without interaction, Scrape with `actions` handles a single one-shot sequence more cheaply.',
    responseShape: '`{ success, sessionId, output, screenshot, liveViewUrl, interactiveLiveViewUrl, sessionOpen }`.',
    failureReasons: ['timeout', 'blocked', 'challenge', 'service_unavailable'],
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

/** `helix_<id>` for every endpoint whose route is live; the MCP server derives the same names from openapi.yaml operationIds. */
export function liveMcpToolNames(): string[] {
  return ENDPOINTS.filter((e) => e.status === 'live').map((e) => `helix_${e.id}`);
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
          body: `Tools are generated from openapi.yaml by the running server, one per operation the running server actually serves: ${toolNames.map((n) => `\`${n}\``).join(', ')}, plus \`helix_get_job\`, \`helix_cancel_job\` and \`helix_get_job_errors\` for asynchronous work and \`helix_health\`. Each tool's description and input schema are the spec's own, with references inlined, so what an agent reads is what the HTTP endpoint accepts. A path that exists in the spec but has no route yet produces no tool.`,
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
          body: 'A SKILL.md is generated per account from the endpoints selected in onboarding. It opens with auth, the base URL, the rate-limit headers and `estimate: true`, then gives one section per endpoint: purpose, when to reach for it versus a sibling, the request and response shapes from openapi.yaml, a curl with your key, and every typed failure reason with what to do about it. Changing your endpoint selection in Preferences regenerates it.',
        },
        {
          title: 'Where it lives',
          body: `Signed in, it is at \`${site}/api/app/skill\` (View and Copy on the Overview page). The same route accepts \`Authorization: Bearer helix-…\` and returns the document for the account that owns the key; that is how \`helix init\` fetches it. The public, keyless version covering every endpoint is at \`${site}/agent-onboarding/SKILL.md\`.`,
          code: { label: 'curl', text: `curl -H "Authorization: Bearer helix-YOUR_KEY" ${site}/api/app/skill` },
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
