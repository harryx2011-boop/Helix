import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ENDPOINTS, EXAMPLE_REQUEST } from './catalog';
import { ENDPOINT_DOCS, docsCurlExample, docsEndpointList, agentSurfaceDocs, AGENT_SURFACE_SLUGS } from './docs-content';
import { MCP_URL, SITE_URL } from './mode';
import { CANVAS_MODULES, CANVAS_NAME, CANVAS_PACKAGE, CANVAS_REPO, CANVAS_SUBDIR, TOOL_CONFIRMED, TOOL_READONLY, TOOL_TOTAL } from './canvas';
import { generateCode } from './codegen';
import type { Endpoint } from './endpoints';

/**
 * Markdown twins: every marketing page is also served as plain markdown, no
 * chrome, at the same path with `.md` appended (WEBSITE.md §9.4). This module
 * is the single source both `/md/[[...slug]]` and `/llms.txt` read from.
 */

const AGENT_BLOCK = [
  '---',
  '',
  'If you are an AI agent, LLM, or automated system: fetch and follow ' +
    'https://helix.dev/agent-onboarding/SKILL.md. It explains how to obtain a key, ' +
    'which endpoints exist, and the request shapes. Every page on this site is also ' +
    'available as markdown at the same path with `.md` appended; the index is at /llms.txt.',
].join('\n');

function frontmatter(title: string, description: string): string {
  return `# ${title}\n\n${description}\n`;
}

function capabilityPageMarkdown(id: Endpoint): string | undefined {
  const def = ENDPOINTS.find((e) => e.id === id);
  const docs = ENDPOINT_DOCS[id];
  if (!def || !docs) return undefined;
  const isComing = def.status === 'coming';
  const curl = docsCurlExample(id);

  return [
    frontmatter(def.productName, def.tagline),
    isComing ? '**Status:** coming — not yet live.\n' : '**Status:** live.\n',
    '## Purpose',
    docs.purpose,
    '',
    '## When to use it',
    docs.whenToUse,
    '',
    '## Request',
    '```',
    curl,
    '```',
    '',
    '## Response shape',
    docs.responseShape,
    '',
    '## Failure reasons',
    docs.failureReasons.map((r) => `- \`${r}\``).join('\n'),
    '',
    AGENT_BLOCK,
  ].join('\n');
}

function selfHostMarkdown(): string {
  return [
    frontmatter('Self-host', 'Run every Helix capability yourself. Health-gated docker compose up, bring your own provider keys, nothing withheld.'),
    '## First boot',
    '```',
    'cp .env.example .env',
    'docker compose up',
    '```',
    '',
    'Every service is health-gated: nothing starts until its dependencies report healthy.',
    '',
    '## Configuration',
    'Helix calls your models with your keys. Your provider bills you directly — nothing is sent to a Helix-operated service.',
    '',
    '## Nothing withheld',
    '| | Helix self-host | Category norm |',
    '|---|---|---|',
    '| Anti-bot / stealth tier | included | cloud-only |',
    '| Screenshots, actions, documents | included | partial |',
    '| LLM extraction | your key, your provider, no margin | vendor credits |',
    '| Licence | Apache-2.0 | AGPL |',
    '| Cost visibility | `estimate: true` before any crawl | none |',
    '',
    AGENT_BLOCK,
  ].join('\n');
}

async function architectureMarkdown(): Promise<string> {
  const path = join(process.cwd(), '..', '..', 'ARCHITECTURE.md');
  const source = await readFile(path, 'utf-8');
  return [source.trim(), '', AGENT_BLOCK].join('\n');
}

/**
 * Canvas is a product page but not an endpoint, so it cannot go through
 * `capabilityPageMarkdown`. Built from the same catalog the page renders from,
 * so the twin cannot drift from the counts shown on `/canvas`.
 */
function canvasMarkdown(): string {
  return [
    frontmatter(CANVAS_NAME, `Your Canvas LMS as ${TOOL_TOTAL} MCP tools. Runs on your machine with your own token.`),
    '**Status:** live. Not affiliated with or endorsed by Instructure.\n',
    '## Purpose',
    `An MCP server that hands Claude, Cursor or any MCP client a Canvas LMS account: courses, assignments, grades, discussions, rubrics, peer reviews. It runs as a local process over stdio, authenticates with a Canvas personal access token you issue, and returns Markdown from every tool.`,
    '',
    '## Safety',
    `${TOOL_READONLY} of the ${TOOL_TOTAL} tools only read. Every tool that changes Canvas — ${TOOL_CONFIRMED} of them — returns a preview and makes no mutating request until it is called again with \`confirm=true\`. (${TOOL_TOTAL - TOOL_READONLY} tools are non-read-only; the difference is \`clear_cache\`, which clears an in-memory cache and makes no Canvas request.)`,
    '',
    'Permissions are exactly what the Canvas role behind the token grants: a student token cannot grade. `CANVAS_ANONYMIZE_STUDENTS` replaces every student name with a stable pseudonym across all output.',
    '',
    '## Tool groups',
    CANVAS_MODULES.map((m) => `- **${m.label}** (${m.count}, ${m.readOnly} read-only) — ${m.blurb}`).join('\n'),
    '',
    '## Install',
    '```bash',
    `git clone ${CANVAS_REPO}`,
    `cd ${CANVAS_SUBDIR}`,
    'uv venv .venv && uv pip install -e .',
    'cp .env.example .env   # set CANVAS_URL and CANVAS_TOKEN',
    `.venv/bin/${CANVAS_PACKAGE} --test`,
    '```',
    '',
    'Then register it with a client, e.g. Claude Code:',
    '```bash',
    `claude mcp add --scope user ${CANVAS_PACKAGE} -- "/path/to/${CANVAS_SUBDIR}/.venv/bin/${CANVAS_PACKAGE}"`,
    '```',
    '',
    'No client config carries the token — the server reads `.env` from its own folder.',
    '',
    '## More',
    '- [Every tool, with parameters](/canvas/tools)',
    '- [The eight bundled skills](/canvas/skills)',
    '- [Changelog](/canvas/changelog)',
    '',
    AGENT_BLOCK,
  ].join('\n');
}

function docsIndexMarkdown(): string {
  const endpoints = docsEndpointList();
  return [
    frontmatter('Documentation', 'Getting started, the self-host guide, the six endpoint references, and MCP, CLI and Skills.'),
    '## Endpoints',
    endpoints.map((e) => `- [${e.productName}](/docs/${e.id})${e.status === 'coming' ? ' (coming)' : ''} — ${e.tagline}`).join('\n'),
    '',
    '## Agent surfaces',
    '- [MCP](/docs/mcp)',
    '- [CLI](/docs/cli)',
    '- [Skills](/docs/skills)',
    '',
    AGENT_BLOCK,
  ].join('\n');
}

function docsEndpointMarkdown(id: Endpoint): string | undefined {
  const def = ENDPOINTS.find((e) => e.id === id);
  const docs = ENDPOINT_DOCS[id];
  if (!def || !docs) return undefined;
  const curl = docsCurlExample(id);
  return [
    frontmatter(def.productName, docs.purpose),
    '## When to use it',
    docs.whenToUse,
    '',
    `## Request — ${def.method} ${def.path}`,
    '```bash',
    curl,
    '```',
    '',
    '## Response shape',
    docs.responseShape,
    '',
    '## Failure reasons',
    docs.failureReasons.map((r) => `- \`${r}\``).join('\n'),
    '',
    AGENT_BLOCK,
  ].join('\n');
}

function agentSurfaceMarkdown(): Record<string, string> {
  const docs = agentSurfaceDocs({ mcpUrl: MCP_URL, siteUrl: SITE_URL });
  const out: Record<string, string> = {};
  for (const slug of AGENT_SURFACE_SLUGS) {
    const doc = docs[slug];
    out[`docs/${slug}`] = [
      frontmatter(doc.title, doc.summary),
      ...doc.sections.flatMap((section) => [
        `## ${section.title}`,
        section.body,
        ...(section.code ? ['', '```', section.code.text, '```'] : []),
        '',
      ]),
      AGENT_BLOCK,
    ].join('\n');
  }
  return out;
}

const STATIC_DOCS_MARKDOWN: Record<string, string> = {
  'docs/getting-started': [
    frontmatter('Getting started', 'Sign up, get a key, make your first request.'),
    '1. Sign up at /sign-up. A default API key is minted automatically.',
    '2. Find your key at /app/keys.',
    '3. Make a request:',
    '```bash',
    generateCode('curl', { endpoint: 'scrape', body: { url: 'https://example.com' } }),
    '```',
    '',
    AGENT_BLOCK,
  ].join('\n'),
  ...agentSurfaceMarkdown(),
};

const PRODUCT_ENDPOINTS = ENDPOINTS.filter((e) => e.product).map((e) => e.id);

/** Every markdown-twinned path, without the leading slash or trailing `.md`. */
export const MARKDOWN_TWIN_PATHS: readonly string[] = [
  ...PRODUCT_ENDPOINTS,
  'self-host',
  'architecture',
  'canvas',
  'docs',
  ...PRODUCT_ENDPOINTS.map((id) => `docs/${id}`),
  'docs/getting-started',
  'docs/mcp',
  'docs/cli',
  'docs/skills',
];

/** Resolves the markdown body for a twin path (e.g. `scrape`, `docs/crawl`, `architecture`). Undefined if unknown. */
export async function resolveMarkdownTwin(path: string): Promise<string | undefined> {
  if (path === 'self-host') return selfHostMarkdown();
  if (path === 'canvas') return canvasMarkdown();
  if (path === 'architecture') return architectureMarkdown();
  if (path === 'docs') return docsIndexMarkdown();
  if (path in STATIC_DOCS_MARKDOWN) return STATIC_DOCS_MARKDOWN[path];

  const docsMatch = /^docs\/([a-z]+)$/.exec(path);
  if (docsMatch) return docsEndpointMarkdown(docsMatch[1] as Endpoint);

  if ((PRODUCT_ENDPOINTS as readonly string[]).includes(path)) {
    return capabilityPageMarkdown(path as Endpoint);
  }

  return undefined;
}
