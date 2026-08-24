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
    'Helix is a web-data API: scrape, parse, search, crawl, interact and monitor the web with your own keys. This document is everything an agent needs to start calling it.',
    '',
    '## 1. Get a key',
    '',
    `Sign up at ${site}/sign-up. A default API key is minted for you automatically and is retrievable at ${site}/app/keys.`,
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
    '## 6. Endpoints',
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
