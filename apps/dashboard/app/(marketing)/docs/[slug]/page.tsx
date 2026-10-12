import * as React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CodePanel, CodeBlock } from '@/components/shared/code-panel';
import { PillButton } from '@/components/shared/pill-button';
import { HeroField } from '@/components/marketing/hero-field';
import { ENDPOINTS, type EndpointDef } from '@/lib/catalog';
import {
  docsEndpointOrThrow,
  docsCurlExample,
  agentSurfaceDocs,
  isAgentSurfaceSlug,
  apiReferenceDoc,
  sdksDoc,
  agentsIndexDoc,
  isReferenceSlug,
  type EndpointDocs,
  type DocSectionContent,
  type ReferenceDoc,
  type ReferenceSlug,
} from '@/lib/docs-content';
import { MCP_URL, SITE_URL } from '@/lib/mode';
import { generateCode } from '@/lib/codegen';
import type { Endpoint } from '@/lib/endpoints';

const STATIC_SLUGS = ['getting-started', 'mcp', 'cli', 'skills', 'api-reference', 'sdks', 'agents'] as const;

const REFERENCE_DOCS: Record<ReferenceSlug, () => ReferenceDoc> = {
  'api-reference': apiReferenceDoc,
  sdks: sdksDoc,
  agents: agentsIndexDoc,
};

export function generateStaticParams() {
  const endpointSlugs = ENDPOINTS.filter((e) => e.product).map((e) => ({ slug: e.id }));
  const staticSlugs = STATIC_SLUGS.map((slug) => ({ slug }));
  return [...staticSlugs, ...endpointSlugs];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const title = titleFor(slug);
  return { title: title ?? 'Docs' };
}

function titleFor(slug: string): string | undefined {
  const endpoint = docsEndpointOrThrow(slug);
  if (endpoint) return endpoint.def.productName;
  if (slug === 'getting-started') return 'Getting Started';
  if (isAgentSurfaceSlug(slug)) return agentSurfaceDocs({ mcpUrl: MCP_URL, siteUrl: SITE_URL })[slug].title;
  if (isReferenceSlug(slug)) return REFERENCE_DOCS[slug]().title;
  return undefined;
}

function seedFor(text: string): number {
  let s = 0;
  for (const ch of text) s += ch.charCodeAt(0);
  return s;
}

export default async function DocsSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const endpoint = docsEndpointOrThrow(slug);
  if (endpoint) return <EndpointDoc def={endpoint.def} docs={endpoint.docs} />;
  if (isAgentSurfaceSlug(slug)) return <AgentSurfaceDoc slug={slug} />;
  if (isReferenceSlug(slug)) return <ReferenceDocPage doc={REFERENCE_DOCS[slug]()} />;
  if (slug === 'getting-started') return <GettingStartedDoc />;
  notFound();
}

function EndpointDoc({ def, docs }: { def: EndpointDef; docs: EndpointDocs }) {
  const isComing = def.status === 'coming';
  const curl = docsCurlExample(def.id as Endpoint);

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="orbit" seed={seedFor(def.id)} className="translate-x-16" />
        <div className="relative mx-auto max-w-[720px] animate-fade-up">
          <div className="flex items-center gap-3">
            <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">{def.productName}</h1>
            {isComing && (
              <span className="rounded-pill bg-violet-12 px-2.5 py-1 font-mono text-[12px] tracking-wide text-violet">coming</span>
            )}
          </div>
          <p className="mt-4 text-[16px] leading-relaxed text-m-ink/72">{docs.purpose}</p>
        </div>
      </div>

      <div className="mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms] space-y-12">
        <DocSection title="When to use it">
          <p className="text-[15px] leading-relaxed text-m-ink/72">{docs.whenToUse}</p>
        </DocSection>

        <DocSection title="Request">
          <CodePanel chrome="terminal" label={`${def.method} ${def.path}`} copyText={curl}>
            <CodeBlock dark>{curl}</CodeBlock>
          </CodePanel>
        </DocSection>

        <DocSection title="Response shape">
          <p className="text-[15px] leading-relaxed text-m-ink/72">{docs.responseShape}</p>
        </DocSection>

        <DocSection title="Failure reasons">
          <div className="flex flex-wrap gap-2">
            {docs.failureReasons.map((reason: string) => (
              <span
                key={reason}
                className="rounded-pill border border-m-border-muted bg-m-surface px-3 py-1 font-mono text-[12px] text-m-ink/72"
              >
                {reason}
              </span>
            ))}
          </div>
        </DocSection>

        {isComing && (
          <p className="rounded-card border border-m-border-muted bg-m-bg-lighter px-5 py-4 text-[14px] text-m-ink/56">
            This endpoint is not live yet. The request and response shapes above are the planned contract.
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <PillButton href={`/${def.id}`} variant="secondary">
            View the {def.productName} page
          </PillButton>
          {!isComing && def.runnable && (
            <PillButton href="/download" variant="primary">
              Get the app
            </PillButton>
          )}
        </div>
      </div>
    </div>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[20px] font-normal leading-tight tracking-tight text-m-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Renders a docs-content body: text with backtick spans as inline code. */
function InlineCode({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-[13px] text-m-ink">
            {part}
          </code>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function ContentSection({ section }: { section: DocSectionContent }) {
  return (
    <DocSection title={section.title}>
      <p className="text-[15px] leading-relaxed text-m-ink/72">
        <InlineCode text={section.body} />
      </p>
      {section.code && (
        <div className="mt-4">
          <CodePanel chrome="terminal" label={section.code.label} copyText={section.code.text}>
            <CodeBlock dark>{section.code.text}</CodeBlock>
          </CodePanel>
        </div>
      )}
    </DocSection>
  );
}

function StaticShell({ h1, children }: { h1: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="orbit" seed={seedFor(h1)} className="translate-x-16" />
        <div className="relative mx-auto max-w-[720px] animate-fade-up">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">{h1}</h1>
        </div>
      </div>
      <div className="mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms] space-y-12">{children}</div>
    </div>
  );
}

function AgentSurfaceDoc({ slug }: { slug: 'mcp' | 'cli' | 'skills' }) {
  const doc = agentSurfaceDocs({ mcpUrl: MCP_URL, siteUrl: SITE_URL })[slug];
  return (
    <StaticShell h1={doc.title}>
      {doc.sections.map((section) => (
        <ContentSection key={section.title} section={section} />
      ))}
    </StaticShell>
  );
}

function EndpointRows({ rows }: { rows: NonNullable<ReferenceDoc['endpointRows']> }) {
  return (
    <DocSection title="Endpoints">
      <ul className="divide-y divide-m-border-faint border-t border-m-border-muted">
        {rows.map((row) => (
          <li key={row.path} className="py-4 first:pt-0">
            <Link
              href={row.docHref}
              className="group flex flex-col gap-1 transition-colors duration-150 ease-out"
            >
              <span className="flex items-center gap-2 font-mono text-[13px]">
                <span className="text-violet">{row.method}</span>
                <span className="text-m-ink group-hover:text-violet">{row.path}</span>
                <span className="text-m-ink/48">— {row.productName}</span>
              </span>
              <span className="text-[14px] leading-relaxed text-m-ink/72">{row.tagline}</span>
            </Link>
          </li>
        ))}
      </ul>
    </DocSection>
  );
}

function ReferenceDocPage({ doc }: { doc: ReferenceDoc }) {
  const [firstSection, ...restSections] = doc.sections;
  return (
    <StaticShell h1={doc.title}>
      {firstSection && <ContentSection section={firstSection} />}
      {doc.endpointRows && <EndpointRows rows={doc.endpointRows} />}
      {restSections.map((section) => (
        <ContentSection key={section.title} section={section} />
      ))}
      {doc.slug === 'agents' && (
        <div className="flex flex-wrap gap-3 pt-2">
          <PillButton href="/docs/mcp" variant="secondary">
            Read MCP
          </PillButton>
          <PillButton href="/docs/cli" variant="secondary">
            Read CLI
          </PillButton>
          <PillButton href="/docs/skills" variant="secondary">
            Read Skills
          </PillButton>
        </div>
      )}
    </StaticShell>
  );
}

function GettingStartedDoc() {
  return (
    <StaticShell h1="Getting Started">
      <DocSection title="1. Run Helix">
        <p className="text-[15px] leading-relaxed text-m-ink/72">
          A Windows app that runs every service for you is <Link href="/download" className="text-violet underline decoration-violet-40 underline-offset-4">coming</Link>. Today, run it from source with the <Link href="/self-host" className="text-violet underline decoration-violet-40 underline-offset-4">self-host guide</Link>.
        </p>
      </DocSection>
      <DocSection title="2. Get your key">
        <p className="text-[15px] leading-relaxed text-m-ink/72">
          A new instance accepts the <code className="font-mono text-[13px]">HELIX_BOOTSTRAP_KEY</code> from its <code className="font-mono text-[13px]">.env</code>; mint more under API Keys in the app. Keys look like <code className="font-mono text-[13px]">helix-a7K2mQ9xP4wR8sT1</code>.
        </p>
      </DocSection>
      <DocSection title="3. Make a request">
        <CodePanel chrome="terminal" label="curl">
          <CodeBlock dark>{generateCode('curl', { endpoint: 'scrape', body: { url: 'https://example.com' } })}</CodeBlock>
        </CodePanel>
      </DocSection>
    </StaticShell>
  );
}
