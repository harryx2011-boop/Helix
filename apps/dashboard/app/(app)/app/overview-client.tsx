'use client';

import * as React from 'react';
import { useAppSession } from '@/components/app/session-provider';
import Link from 'next/link';
import { Check, Copy, Eye, EyeOff, FileText, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageFrame, FrameRow, FrameHeading, FrameCells, FrameTag } from '@/components/app/page-frame';
import { CharChart } from '@/components/app/char-chart';
import { ConnectSheet } from '@/components/app/connect-sheet';
import { HOSTED, MCP_URL, SITE_URL } from '@/lib/mode';
import { claudeMcpAddCommand, cliInitCommand } from '@/lib/connect';
import { endpointById, PRODUCTS } from '@/lib/catalog';
import { AsciiFluid } from '@/components/shared/ascii-fluid';
import { AsciiNoise, AsciiOrbit } from '@/components/shared/ascii-fields';

interface EndpointSummary {
  id: string;
  name: string;
  tagline: string;
  status: 'live' | 'coming';
  route: string;
}

interface RequestsSeries {
  labels: string[];
  values: number[];
}

function ExploreCell({ endpoint }: { endpoint: EndpointSummary }) {
  const def = endpointById(endpoint.id);
  const Icon = def?.icon ?? FileText;
  return (
    <Link
      key={endpoint.id}
      href={endpoint.status === 'live' && def?.runnable ? `/app/playground?tab=${endpoint.id}` : `/${endpoint.id}`}
      className="group flex flex-col gap-2 p-5 transition-colors duration-150 ease-out hover:bg-secondary/40"
    >
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
        {endpoint.status === 'coming' && (
          <span className="rounded-pill bg-primary/12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">
            coming
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium leading-tight">{endpoint.name}</span>
        <span className="text-[13px] leading-snug text-muted-foreground">{endpoint.tagline}</span>
      </div>
    </Link>
  );
}

function ExploreRow({ endpoints }: { endpoints: EndpointSummary[] }) {
  // Map lives inside Search/Crawl (WEBSITE.md §11: "not a seventh product") — only the
  // six standalone products get a cell, so the grid never orphans a lone item on its own row.
  const productIds = new Set(PRODUCTS.map((p) => p.id));
  const products = endpoints.filter((e) => productIds.has(e.id as (typeof PRODUCTS)[number]['id']));
  const firstRow = products.slice(0, 3);
  const secondRow = products.slice(3, 6);

  return (
    <>
      <FrameRow>
        <FrameHeading
          title="Explore your endpoints"
          description="Every endpoint, one envelope. Open any of them in the playground."
          field={
            <AsciiNoise
              cols={90}
              rows={6}
              seed={5}
              tone="app"
              className="absolute right-0 top-1/2 hidden -translate-y-1/2 opacity-40 md:block [mask-image:linear-gradient(to_right,transparent,black_35%,black_85%,transparent)]"
            />
          }
        />
      </FrameRow>
      <FrameRow>
        <FrameCells cols={3}>
          {firstRow.map((e) => (
            <ExploreCell key={e.id} endpoint={e} />
          ))}
        </FrameCells>
      </FrameRow>
      {secondRow.length > 0 && (
        <FrameRow>
          <FrameCells cols={3}>
            {secondRow.map((e) => (
              <ExploreCell key={e.id} endpoint={e} />
            ))}
          </FrameCells>
        </FrameRow>
      )}
    </>
  );
}

function ActiveBrowsersRow() {
  return (
    <FrameRow flush>
      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[15px] font-medium leading-tight text-foreground">Active browsers</span>
            <FrameTag tone="accent">live</FrameTag>
          </div>
          <span className="text-[13px] text-muted-foreground">Interact sessions currently open on this instance</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-pill border border-border font-mono text-sm text-foreground">0</span>
          <span className="text-[13px] text-muted-foreground">of 4 active browsers</span>
        </div>
      </div>
    </FrameRow>
  );
}

function ApiKeyRow({ welcome }: { welcome: boolean }) {
  const { apiKey } = useAppSession();
  const [showing, setShowing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // The key lives in this browser, so revealing it is a local toggle rather
  // than a request for something the server is holding.
  const masked = apiKey ? `${apiKey.slice(0, 10)}${'•'.repeat(8)}${apiKey.slice(-3)}` : null;
  const display = showing && apiKey ? apiKey : (masked ?? '·'.repeat(8));

  const onCopy = React.useCallback(() => {
    const value = apiKey ?? '';
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [apiKey]);


  return (
    <div className="flex flex-col gap-3 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium leading-tight text-foreground">API key</h3>
          <p className="text-[13px] text-muted-foreground">{welcome ? 'Copy it now — you can reveal it again anytime with the eye icon.' : 'Use it as a Bearer token'}</p>
        </div>
        <div aria-hidden className="pointer-events-none relative hidden h-10 w-24 shrink-0 overflow-hidden lg:block">
          <AsciiOrbit
            cols={16}
            rows={7}
            seed={2}
            tone="app"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]"
          />
        </div>
      </div>
      {apiKey === null ? (
        <p className="text-[13px] text-muted-foreground">Key is held in this browser. Open the connect sheet below to generate one.</p>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-card bg-secondary/40 px-3 py-2.5">
          <span className="truncate font-mono text-sm text-primary">{display}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setShowing((v) => !v)} aria-label={showing ? 'Hide key' : 'Reveal key'}>
              {showing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onCopy} aria-label="Copy key">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface IntegrationRow {
  id: string;
  label: string;
  description?: string;
  lines?: string[];
  action: 'view' | 'copy';
  href?: string;
  copyText?: string;
}

function AgentIntegrations({ initialOpen }: { initialOpen: boolean }) {
  const { apiKey: sessionKey } = useAppSession();
  const apiKey = sessionKey ?? 'helix-YOUR_KEY';
  const [open, setOpen] = React.useState(initialOpen);
  const [copiedRow, setCopiedRow] = React.useState<string | null>(null);

  const cliCmd = cliInitCommand({ apiKey, mcpUrl: MCP_URL, siteUrl: SITE_URL });
  const mcpLines = claudeMcpAddCommand({ apiKey, mcpUrl: MCP_URL });

  const copyRow = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedRow(id);
      setTimeout(() => setCopiedRow(null), 1500);
    });
  };

  const rows: IntegrationRow[] = [
    { id: 'skill', label: 'SKILL.md', description: "Paste into your AI agent's context", action: 'view', href: '/agent-onboarding/SKILL.md' },
    { id: 'cli', label: 'CLI', lines: [cliCmd], action: 'copy', copyText: cliCmd },
    { id: 'mcp', label: 'MCP', description: 'Connect an MCP client', action: 'copy', copyText: mcpLines.join('\n') },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <div>
          <h3 className="text-[15px] font-medium leading-tight text-foreground">Agent integrations</h3>
          <p className="text-[13px] text-muted-foreground">Give your agents web data</p>
        </div>
        <Button size="sm" className="gap-1.5 rounded-pill" onClick={() => setOpen(true)}>
          <Plug className="h-3.5 w-3.5" />
          Set up an agent
        </Button>
      </div>
      <div className="flex flex-col divide-y divide-border border-t border-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 px-6 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{row.label}</span>
              {row.description && <span className="truncate text-xs text-muted-foreground">{row.description}</span>}
              {row.lines?.map((line) => (
                <span key={line} className="truncate font-mono text-xs text-foreground">
                  {line}
                </span>
              ))}
            </div>
            {row.action === 'view' ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" asChild>
                  <a href={row.href} target="_blank" rel="noreferrer">
                    View
                  </a>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => row.href && copyRow(row.id, row.href)}>
                  {copiedRow === row.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 font-mono text-xs"
                onClick={() => row.copyText && copyRow(row.id, row.copyText)}
              >
                {copiedRow === row.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy
              </Button>
            )}
          </div>
        ))}
      </div>
      <ConnectSheet open={open} onOpenChange={setOpen} apiKey={apiKey} />
    </>
  );
}

export function OverviewClient({
  endpoints,
  welcome,
  connect,
}: {
  endpoints: EndpointSummary[];
  welcome: boolean;
  /** Omitted by the static-export build, which cannot read searchParams on the server. */
  connect?: boolean;
}) {
  const [urlConnect, setUrlConnect] = React.useState(false);

  React.useEffect(() => {
    if (connect !== undefined) return;
    setUrlConnect(new URLSearchParams(window.location.search).get('connect') === '1');
  }, [connect]);

  const connectOpen = connect ?? urlConnect;
  const interactLive = endpoints.some((e) => e.id === 'interact' && e.status === 'live');

  return (
    <PageFrame>
      <ExploreRow endpoints={endpoints} />
      <FrameRow className="h-10">
        <div />
      </FrameRow>
      <FrameRow flush={!interactLive}>
        <div className="grid min-w-0 lg:grid-cols-[1.4fr_1fr] lg:divide-x lg:divide-border">
          <div className="relative flex min-w-0 flex-col divide-y divide-border overflow-hidden">
            {interactLive && <ActiveBrowsersRow />}
            <AsciiFluid
              cols={44}
              rows={12}
              seed={9}
              tone="app"
              className="absolute bottom-0 right-0 hidden !border-0 lg:block [mask-image:linear-gradient(to_left,black_60%,transparent)]"
            />
          </div>
          <div className="flex min-w-0 flex-col divide-y divide-border">
            <ApiKeyRow welcome={welcome} />
            <AgentIntegrations initialOpen={connectOpen} />
          </div>
        </div>
      </FrameRow>
    </PageFrame>
  );
}
