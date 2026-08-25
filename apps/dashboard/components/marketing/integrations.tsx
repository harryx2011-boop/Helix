'use client';

import * as React from 'react';
import Link from 'next/link';
import { Blocks, Terminal, Workflow } from 'lucide-react';
import { SectionEyebrow } from './section-eyebrow';
import { CodePanel, CodeBlock } from './code-panel';

interface Integration {
  id: string;
  icon: typeof Blocks;
  title: string;
  body: string;
  label: string;
  snippet: string;
  href: string;
  linkLabel: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'sdk',
    icon: Blocks,
    title: 'SDK',
    body: 'Typed clients for every endpoint. One call in, the same envelope back.',
    label: 'npm',
    snippet: 'npm install @helix/sdk',
    href: '/docs',
    linkLabel: 'Read the docs',
  },
  {
    id: 'mcp',
    icon: Workflow,
    title: 'MCP',
    body: 'Six tools over one MCP server. Point any agent harness at it and it can scrape, parse, search, crawl, interact and monitor.',
    label: 'shell',
    snippet: 'claude mcp add --transport http helix \\\n  https://mcp.helix.dev/v1 \\\n  --header "Authorization: Bearer $HELIX_API_KEY"',
    href: '/docs/mcp',
    linkLabel: 'Read the MCP docs',
  },
  {
    id: 'cli',
    icon: Terminal,
    title: '@helix/cli',
    body: 'Wires an agent harness (Claude Code, Cursor, Codex, Windsurf) to a Helix instance: MCP config and a SKILL.md, written in one command.',
    label: 'shell',
    snippet: 'npx -y @helix/cli@latest init --all -k helix-YOUR_KEY',
    href: '/docs/cli',
    linkLabel: 'Read the CLI docs',
  },
];

/** SDK · MCP · CLI, each with a copyable install snippet. */
export function Integrations() {
  return (
    <section className="border-t border-m-border-faint bg-m-bg-lighter px-4 py-20">
      <div className="mx-auto max-w-container">
        <div data-reveal>
          <SectionEyebrow step="02 / 04" label="INTEGRATIONS" sub="Wire it into your stack" />
          <h2 className="mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
            Connect it however your agent already works.
          </h2>
        </div>

        <div data-reveal-group className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {INTEGRATIONS.map((item) => (
            <IntegrationCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function IntegrationCard({ item }: { item: Integration }) {
  const Icon = item.icon;
  return (
    <div data-reveal-item className="flex flex-col rounded-card border border-m-border-muted bg-m-surface p-5 shadow-card-sm">
      <Icon className="h-5 w-5 text-violet" strokeWidth={1.75} aria-hidden />
      <h3 className="mt-3 text-[18px] font-medium leading-tight tracking-tight">{item.title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-m-ink/64">{item.body}</p>

      <div className="mt-4">
        <CodePanel chrome="terminal" label={item.label} copyText={item.snippet}>
          <CodeBlock dark>{item.snippet}</CodeBlock>
        </CodePanel>
      </div>

      <Link
        href={item.href}
        className="mt-4 text-[13px] font-medium text-violet transition-colors duration-150 ease-out hover:text-violet-hover"
      >
        {item.linkLabel} →
      </Link>
    </div>
  );
}
