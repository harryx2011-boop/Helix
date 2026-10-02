import { NextResponse } from 'next/server';
import { SITE_URL, PUBLIC_API_URL } from '@/lib/mode';
import { docsEndpointList, ENDPOINT_DOCS, docsCurlExample } from '@/lib/docs-content';

export const dynamic = 'force-static';

/**
 * Public, ungated agent onboarding (WEBSITE.md §2, §9.3): the same generator that
 * produces a per-user SKILL.md, run here with every endpoint and no key. Explains
 * how to obtain a key, which endpoints exist, and the request shapes.
 */
export async function GET() {
  return new NextResponse(buildSkillMd(), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}

function buildSkillMd(): string {
  const site = SITE_URL.replace(/\/$/, '');
  const api = PUBLIC_API_URL.replace(/\/$/, '');
  const endpoints = docsEndpointList();

  const preamble = [
    '# Helix — Agent Onboarding',
    '',
    'Helix is a frontier utility hub: scrape, parse, search, crawl, interact and monitor the web with your own keys. This document is everything an agent needs to start calling it.',
    '',
    '## 1. Get a key',
    '',
    `Helix runs on the user's own machine (the Windows app from ${site}/download, or a source checkout from ${site}/self-host). A new instance accepts the HELIX_BOOTSTRAP_KEY from its \`.env\`; mint more under API Keys in the app, or \`POST /v1/keys\` with an existing key. The key is shown once.`,
    '',
    'The key is a secret. Resolve it from `HELIX_API_KEY` in your own shell or from `.env.local`; check for it with a presence test (`${HELIX_API_KEY:+set}`) or an HTTP status code, and never print, echo, cat or grep-with-output anything that may contain it. If it is exposed, revoke it and mint a new one — from the app\'s API Keys page, or with `DELETE /v1/keys/{id}` on a self-hosted instance.',
    '',
    '## 2. Base URL',
    '',
    '```',
    api,
    '```',
    '',
    '## 3. Authentication',
    '',
    'Every request carries the key as a bearer token:',
    '',
    '```',
    'Authorization: Bearer helix-YOUR_KEY',
    '```',
    '',
    '## 4. Rate limits',
    '',
    'Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, so you can self-throttle without parsing an error string. Rate limiting fails open: if the limiter\'s backing store is unreachable, the request proceeds.',
    '',
    '## 5. Cost estimation',
    '',
    'Any operation whose cost scales with discovered pages (Crawl, Monitor) accepts `estimate: true` and returns projected work — page count, tier distribution, and cost — instead of running.',
    '',
    '## 6. Where this file lives',
    '',
    'Save it as `SKILL.md` under `.claude/skills/helix/` (Claude Code, project-local) or `~/.claude/skills/helix/` (global); `.agents/skills/helix/` or `~/.agents/skills/helix/` for Codex, Cursor and other Agent-Skills tools. `npx -y @helix/cli@latest init --all` writes it, plus the MCP config, for every harness it finds.',
    '',
    '## 7. Endpoints',
    '',
    'One section below per endpoint: purpose, when to use it versus a sibling, the request and response shape, a ready-to-run curl, and the failure reasons it can return.',
  ].join('\n');

  const sections = endpoints.flatMap((endpoint) => {
    const docs = ENDPOINT_DOCS[endpoint.id];
    if (!docs) return [];
    const curl = docsCurlExample(endpoint.id);
    const status = endpoint.status === 'coming' ? ' — not yet live' : '';

    return [[
      `### ${endpoint.productName}${status}`,
      '',
      `**Purpose.** ${docs.purpose}`,
      '',
      `**When to use it.** ${docs.whenToUse}`,
      '',
      `**Request** — \`${endpoint.method} ${endpoint.path}\``,
      '',
      '```bash',
      curl,
      '```',
      '',
      '**Response shape.** ' + docs.responseShape,
      '',
      '**Failure reasons.**',
      docs.failureReasons.map((reason) => `- \`${reason}\``).join('\n'),
    ].join('\n')];
  });

  return [preamble, '---', '', sections.join('\n\n---\n\n'), '', '---', '', `Full documentation: ${site}/docs. Markdown index: ${site}/llms.txt.`].join('\n');
}
