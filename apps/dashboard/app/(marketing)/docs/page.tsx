import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Server, Terminal, Puzzle, type LucideIcon } from 'lucide-react';
import { HeroField } from '@/components/marketing/hero-field';
import { docsEndpointList, agentSurfaceDocs } from '@/lib/docs-content';
import { MCP_URL, SITE_URL } from '@/lib/mode';

export const metadata: Metadata = {
  title: 'Docs',
  description: 'Getting started, the self-host guide, the six endpoint references, and MCP, CLI and Skills.',
};

export default function DocsIndexPage() {
  const endpoints = docsEndpointList();
  const surfaces = agentSurfaceDocs({ mcpUrl: MCP_URL, siteUrl: SITE_URL });

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="cloud" seed={23} className="top-1/2 -translate-y-1/2" />
        <div className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Documentation
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
            Getting started, the self-host guide, and a reference page for every endpoint in the catalog.
          </p>
        </div>
      </div>

      <section className="mx-auto mt-16 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-m-ink/48">Start here</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DocLink href="/docs/getting-started" icon={BookOpen} title="Getting Started" body="Run Helix, get a key, make your first request." />
          <DocLink href="/self-host" icon={Server} title="Self-host" body="docker compose up, health-gated, nothing withheld." />
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-[880px] animate-fade-up [animation-delay:120ms]">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-m-ink/48">Endpoints</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {endpoints.map((endpoint) => (
            <DocLink
              key={endpoint.id}
              href={`/docs/${endpoint.id}`}
              icon={endpoint.icon}
              title={endpoint.productName}
              body={endpoint.tagline}
              badge={endpoint.status === 'coming' ? 'coming' : undefined}
            />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-[880px] animate-fade-up [animation-delay:180ms]">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-m-ink/48">Agent surfaces</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DocLink href="/docs/mcp" icon={Puzzle} title={surfaces.mcp.title} body={surfaces.mcp.summary} />
          <DocLink href="/docs/cli" icon={Terminal} title={surfaces.cli.title} body={surfaces.cli.summary} />
          <DocLink href="/docs/skills" icon={BookOpen} title={surfaces.skills.title} body={surfaces.skills.summary} />
        </div>
      </section>
    </div>
  );
}

function DocLink({
  href,
  icon: Icon,
  title,
  body,
  badge,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  body: string;
  badge?: string | undefined;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-card border border-m-border-muted bg-m-surface p-5 shadow-card-sm transition-colors duration-200 ease-out hover:bg-m-ink/[0.031]"
    >
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-violet" strokeWidth={1.75} aria-hidden />
        {badge && (
          <span className="rounded-pill bg-violet-12 px-2 py-0.5 font-mono text-[11px] tracking-wide text-violet">{badge}</span>
        )}
      </div>
      <h3 className="mt-3 text-[16px] font-medium leading-tight text-m-ink">{title}</h3>
      <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-m-ink/72">{body}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[13px] text-violet opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100">
        Read more <ArrowRight className="h-3 w-3" aria-hidden />
      </span>
    </Link>
  );
}
