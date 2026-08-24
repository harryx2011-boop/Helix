'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, Eye, EyeOff, FileText, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CharChart } from '@/components/app/char-chart';
import { ConnectSheet } from '@/components/app/connect-sheet';
import { HOSTED, MCP_URL, SITE_URL } from '@/lib/mode';
import { claudeMcpAddCommand, cliInitCommand } from '@/lib/connect';
import { endpointById, PRODUCTS } from '@/lib/catalog';

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

function ExploreRow({ endpoints }: { endpoints: EndpointSummary[] }) {
  // Map lives inside Search/Crawl (WEBSITE.md §11: "not a seventh product") — only the
  // six standalone products get a cell, so the grid never orphans a lone item on its own row.
  const productIds = new Set(PRODUCTS.map((p) => p.id));
  const products = endpoints.filter((e) => productIds.has(e.id as (typeof PRODUCTS)[number]['id']));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Explore your endpoints</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x lg:grid-cols-3">
          {products.map((e) => {
            const def = endpointById(e.id);
            const Icon = def?.icon ?? FileText;
            return (
              <Link
                key={e.id}
                href={e.status === 'live' ? `/app/playground?tab=${e.id}` : '#'}
                className="group flex flex-col gap-2 p-4 transition-colors duration-150 ease-out hover:bg-secondary/40"
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
                  {e.status === 'coming' && (
                    <span className="rounded-pill bg-primary/12 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">
                      coming
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium leading-tight">{e.name}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{e.tagline}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RequestsChart() {
  const [series, setSeries] = React.useState<RequestsSeries | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/app/usage?days=7')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.labels) && Array.isArray(data.requests)) {
          setSeries({ labels: data.labels, values: data.requests });
        } else {
          const labels = Array.from({ length: 7 }, (_, i) => `D${i + 1}`);
          setSeries({ labels, values: labels.map(() => 0) });
        }
      })
      .catch(() => {
        const labels = Array.from({ length: 7 }, (_, i) => `D${i + 1}`);
        setSeries({ labels, values: labels.map(() => 0) });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const total = series?.values.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Requests, last 7 days</CardTitle>
        <span className="font-mono text-xs text-foreground">{total}</span>
      </CardHeader>
      <CardContent>
        {loading || !series ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <CharChart series={[{ label: 'requests', values: series.values }]} labels={series.labels} height={8} />
        )}
      </CardContent>
    </Card>
  );
}

function ApiKeyPanel({ keyMasked, revealedKey, welcome }: { keyMasked: string | null; revealedKey: string | null; welcome: boolean }) {
  const [revealed, setRevealed] = React.useState<string | null>(revealedKey);
  const [showing, setShowing] = React.useState(Boolean(revealedKey));
  const [copied, setCopied] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const onReveal = React.useCallback(async () => {
    if (showing) {
      setShowing(false);
      return;
    }
    if (revealed) {
      setShowing(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/app/keys/default/reveal');
      if (res.ok) {
        const data = await res.json();
        setRevealed(data.key ?? null);
        setShowing(true);
      }
    } finally {
      setLoading(false);
    }
  }, [showing, revealed]);

  const onCopy = React.useCallback(() => {
    const value = revealed ?? keyMasked ?? '';
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [revealed, keyMasked]);

  const display = showing && revealed ? revealed : keyMasked ?? '········';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">API key</CardTitle>
        {welcome && <CardDescription>Copy it now — you can reveal it again anytime with the eye icon.</CardDescription>}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <span className="truncate font-mono text-sm text-primary">{display}</span>
        <div className="flex shrink-0 items-center gap-1">
          {HOSTED && (
            <Button variant="ghost" size="icon" onClick={onReveal} disabled={loading} aria-label={showing ? 'Hide key' : 'Reveal key'}>
              {showing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onCopy} aria-label="Copy key">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
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

function AgentIntegrations({ apiKey, initialOpen }: { apiKey: string; initialOpen: boolean }) {
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
    { id: 'skill', label: 'SKILL.md', description: 'Per-endpoint reference for your selected APIs.', action: 'view', href: '/api/app/skill' },
    { id: 'cli', label: 'CLI', lines: [cliCmd], action: 'copy', copyText: cliCmd },
    { id: 'mcp', label: 'MCP', lines: mcpLines, action: 'copy', copyText: mcpLines.join('\n') },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Agent integrations</CardTitle>
        <Button size="sm" className="gap-1.5 rounded-pill" onClick={() => setOpen(true)}>
          <Plug className="h-3.5 w-3.5" />
          Set up an agent
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{row.label}</span>
              {row.description && <span className="text-xs text-muted-foreground">{row.description}</span>}
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
      </CardContent>
      <ConnectSheet open={open} onOpenChange={setOpen} apiKey={apiKey} />
    </Card>
  );
}

export function OverviewClient({
  endpoints,
  keyMasked,
  revealedKey,
  welcome,
  connect,
}: {
  endpoints: EndpointSummary[];
  keyMasked: string | null;
  revealedKey: string | null;
  welcome: boolean;
  connect: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <ExploreRow endpoints={endpoints} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RequestsChart />
        <ApiKeyPanel keyMasked={keyMasked} revealedKey={revealedKey} welcome={welcome} />
      </div>
      <AgentIntegrations apiKey={revealedKey ?? keyMasked ?? 'helix-YOUR_KEY'} initialOpen={connect} />
      {endpoints.some((e) => e.id === 'interact' && e.status === 'live') && (
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <span className="rounded-pill bg-primary/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-primary">Live</span>
            <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Active sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm text-muted-foreground">0 of 4 active browsers</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
