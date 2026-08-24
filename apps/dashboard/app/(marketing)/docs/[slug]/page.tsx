import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { CodePanel, CodeBlock } from '@/components/marketing/code-panel';
import { PillButton } from '@/components/marketing/pill-button';
import { ENDPOINTS, type EndpointDef } from '@/lib/catalog';
import { docsEndpointOrThrow, docsCurlExample, type EndpointDocs } from '@/lib/docs-content';
import { generateCode } from '@/lib/codegen';
import type { Endpoint } from '@/lib/supabase/types';

const STATIC_SLUGS = ['getting-started', 'mcp', 'cli', 'skills'] as const;
type StaticSlug = (typeof STATIC_SLUGS)[number];

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
  const titles: Record<StaticSlug, string> = {
    'getting-started': 'Getting started',
    mcp: 'MCP',
    cli: 'CLI',
    skills: 'Skills',
  };
  return STATIC_SLUGS.includes(slug as StaticSlug) ? titles[slug as StaticSlug] : undefined;
}

export default async function DocsSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const endpoint = docsEndpointOrThrow(slug);
  if (endpoint) return <EndpointDoc def={endpoint.def} docs={endpoint.docs} />;
  if (STATIC_SLUGS.includes(slug as StaticSlug)) return <StaticDoc slug={slug as StaticSlug} />;
  notFound();
}

function EndpointDoc({ def, docs }: { def: EndpointDef; docs: EndpointDocs }) {
  const isComing = def.status === 'coming';
  const curl = docsCurlExample(def.id as Endpoint);

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="mx-auto max-w-[720px] animate-fade-up">
        <SectionEyebrow step="DOCS" label={def.productName.toUpperCase()} sub={def.method + ' ' + def.path} />
        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">{def.productName}</h1>
          {isComing && (
            <span className="rounded-pill bg-violet-12 px-2.5 py-1 font-mono text-[12px] tracking-wide text-violet">coming</span>
          )}
        </div>
        <p className="mt-4 text-[16px] leading-relaxed text-m-ink/72">{docs.purpose}</p>
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
          {!isComing && (
            <PillButton href={`/app/playground?tab=${def.id}`} variant="primary">
              Open in playground
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

function StaticDoc({ slug }: { slug: StaticSlug }) {
  const content: Record<StaticSlug, { h1: string; body: React.ReactNode }> = {
    'getting-started': {
      h1: 'Getting started',
      body: (
        <>
          <DocSection title="1. Sign up">
            <p className="text-[15px] leading-relaxed text-m-ink/72">
              Create an account at <Link href="/sign-up" className="text-violet underline decoration-violet-40 underline-offset-4">/sign-up</Link>. A default API key is minted for you automatically.
            </p>
          </DocSection>
          <DocSection title="2. Get your key">
            <p className="text-[15px] leading-relaxed text-m-ink/72">
              Find it under <Link href="/app/keys" className="text-violet underline decoration-violet-40 underline-offset-4">/app/keys</Link>. Keys look like <code className="font-mono text-[13px]">helix-a7K2mQ9xP4wR8sT1</code>.
            </p>
          </DocSection>
          <DocSection title="3. Make a request">
            <CodePanel chrome="terminal" label="curl">
              <CodeBlock dark>{generateCode('curl', { endpoint: 'scrape', body: { url: 'https://example.com' } })}</CodeBlock>
            </CodePanel>
          </DocSection>
        </>
      ),
    },
    mcp: {
      h1: 'MCP',
      body: (
        <DocSection title="Connect">
          <p className="text-[15px] leading-relaxed text-m-ink/72">
            Helix exposes an MCP server at <code className="font-mono text-[13px]">https://mcp.helix.dev/v1</code> over streamable HTTP.
            Tools mirror the endpoint catalog, generated from openapi.yaml so descriptions cannot drift.
          </p>
          <div className="mt-4">
            <CodePanel chrome="terminal" label="claude mcp add">
              <CodeBlock dark>{generateCode('mcp', { endpoint: 'scrape', body: { url: 'https://example.com' } })}</CodeBlock>
            </CodePanel>
          </div>
        </DocSection>
      ),
    },
    cli: {
      h1: 'CLI',
      body: (
        <DocSection title="Install">
          <p className="text-[15px] leading-relaxed text-m-ink/72">
            The CLI detects installed agent harnesses and writes their MCP config plus your SKILL.md in one step.
          </p>
          <div className="mt-4">
            <CodePanel chrome="terminal" label="terminal" copyText="npx -y @helix/cli@latest init --all -k helix-YOUR_KEY">
              <CodeBlock dark>npx -y @helix/cli@latest init --all -k helix-YOUR_KEY</CodeBlock>
            </CodePanel>
          </div>
        </DocSection>
      ),
    },
    skills: {
      h1: 'Skills',
      body: (
        <DocSection title="SKILL.md">
          <p className="text-[15px] leading-relaxed text-m-ink/72">
            A SKILL.md is generated per account from the endpoints you selected in onboarding — purpose, request/response
            and failure reasons for each one. The public, ungated version covering every endpoint lives at{' '}
            <Link href="/agent-onboarding/SKILL.md" className="text-violet underline decoration-violet-40 underline-offset-4">
              /agent-onboarding/SKILL.md
            </Link>
            .
          </p>
        </DocSection>
      ),
    },
  };

  const { h1, body } = content[slug];

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="mx-auto max-w-[720px] animate-fade-up">
        <SectionEyebrow step="DOCS" label={h1.toUpperCase()} sub="reference" />
        <h1 className="mt-6 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">{h1}</h1>
      </div>
      <div className="mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms] space-y-12">{body}</div>
    </div>
  );
}
