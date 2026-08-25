'use client';

import * as React from 'react';
import { ArrowRight, FileScan, Globe, Map as MapIcon, Network, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateCode, type Lang } from '@/lib/codegen';
import { EXAMPLE_REQUEST } from '@/lib/catalog';
import type { Endpoint } from '@/lib/supabase/types';
import { AnimatedCode, randomGlyphString, usePrefersReducedMotion } from './animated-code';
import { CodeToken } from './code-panel';
import { LadderExplainer } from './ladder-explainer';

/**
 * WEBSITE.md §4.2 hero panel + research/17 prompt-box anatomy: URL input row,
 * endpoint pill tabs inside the box, generated request (type-mode) and a
 * response preview (scramble-mode), then the ladder explainer below.
 * Composes only — never fetches.
 */
export function HeroPanel({ id }: { id?: string }) {
  const [url, setUrl] = React.useState('');
  const [endpoint, setEndpoint] = React.useState<Endpoint>('scrape');
  const [playKey, setPlayKey] = React.useState<number | undefined>(undefined);
  const [requestKey, setRequestKey] = React.useState(0);
  // Response scramble only starts once the request finishes typing (research/17):
  // gated by requestDone, and re-keyed only when the request itself re-types.
  const [requestDone, setRequestDone] = React.useState(false);

  const lang: Lang = 'curl';
  const body = { ...EXAMPLE_REQUEST[endpoint], ...(url ? { url } : {}) };
  const code = generateCode(lang, { endpoint, body });
  const response = RESPONSE_PREVIEW[endpoint];

  const handleRequestDone = React.useCallback(() => setRequestDone(true), []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPlayKey((k) => (k ?? 0) + 1);
    setRequestDone(false);
    setRequestKey((k) => k + 1);
  }

  function selectEndpoint(id: Endpoint) {
    setEndpoint(id);
    setRequestDone(false);
    setRequestKey((k) => k + 1);
  }

  React.useEffect(() => {
    function onReplay() {
      setPlayKey((k) => (k ?? 0) + 1);
    }
    window.addEventListener('helix:play-ladder', onReplay);
    return () => window.removeEventListener('helix:play-ladder', onReplay);
  }, []);

  return (
    <div id={id} className="w-full min-w-0 max-w-full overflow-hidden rounded-panel bg-m-surface shadow-card ring-8 ring-m-bg sm:max-w-[720px]">
      <form onSubmit={handleSubmit} className="min-w-0 border-b border-m-border-faint p-3">
        <div className="flex min-w-0 items-center gap-2 rounded-card border border-m-border-muted bg-m-bg px-3 py-2">
          <Globe className="h-4 w-4 shrink-0 text-m-ink/40" aria-hidden />
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder=" "
              className="w-full bg-transparent font-mono text-[13px] text-m-ink outline-none"
              aria-label="URL to fetch"
            />
            {url === '' && (
              <div className="pointer-events-none absolute inset-0 flex items-center">
                <RotatingPlaceholder endpoint={endpoint} />
              </div>
            )}
          </div>
          <button
            type="submit"
            aria-label="Compose the request"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-violet text-white shadow-btn transition-shadow duration-200 ease-out hover:shadow-btn-hover"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1 rounded-pill bg-m-bg p-1">
          {HERO_ENDPOINTS.map((e) => {
            const Icon = e.icon;
            const active = endpoint === e.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => selectEndpoint(e.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-mono text-[12px] transition-colors duration-150 ease-out',
                  active ? 'bg-violet-12 text-violet' : 'text-m-ink/48 hover:text-m-ink/72',
                )}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {e.name}
              </button>
            );
          })}
        </div>
      </form>

      <div className="w-full min-w-0 max-w-full overflow-x-auto px-4 py-4">
        <AnimatedCode key={`req-${requestKey}`} code={code} mode="type" charMs={14} playOnView={false} onDone={handleRequestDone} />
      </div>

      <div className="min-w-0 max-w-full border-t border-m-border-faint px-4 py-4">
        <p className="mb-2 font-mono text-[11px] tracking-wide text-m-ink/48">[ RESPONSE ]</p>
        <div className="w-full min-w-0 max-w-full overflow-x-auto">
          {requestDone ? (
            <AnimatedCode key={`res-${requestKey}`} code={response} mode="scramble" resolveMs={2200} loop playOnView />
          ) : (
            <ScrambledPlaceholder code={response} />
          )}
        </div>
      </div>

      <div className="min-w-0 max-w-full border-t border-m-border-faint bg-m-bg-lighter px-4 py-4">
        {playKey === undefined ? <LadderExplainer /> : <LadderExplainer playKey={playKey} />}
      </div>
    </div>
  );
}

const HERO_ENDPOINTS: { id: Endpoint; name: string; icon: typeof Globe }[] = [
  { id: 'scrape', name: 'Scrape', icon: Globe },
  { id: 'parse', name: 'Parse', icon: FileScan },
  { id: 'search', name: 'Search', icon: Search },
  { id: 'crawl', name: 'Crawl', icon: Network },
  { id: 'map', name: 'Map', icon: MapIcon },
];

const PLACEHOLDERS: Record<Endpoint, string> = {
  scrape: 'https://example.com/pricing',
  parse: 'https://docs.stripe.com/webhooks',
  search: 'https://news.ycombinator.com',
  map: 'https://example.com',
  crawl: 'https://example.com',
  interact: 'https://example.com/shop',
  monitor: 'https://example.com/pricing',
};

const PLACEHOLDER_ROTATION = [
  'https://example.com/pricing',
  'https://docs.stripe.com/webhooks',
  'https://news.ycombinator.com',
  'https://example.com/files/report.pdf',
];

/** research/17 §2: --text-swap-dur .15s, translateY 4px, blur 2px, ease-in-out. */
function RotatingPlaceholder({ endpoint }: { endpoint: Endpoint }) {
  const [index, setIndex] = React.useState(() => Math.max(0, PLACEHOLDER_ROTATION.indexOf(PLACEHOLDERS[endpoint])));
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => {
    if (reducedMotion) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % PLACEHOLDER_ROTATION.length), 3200);
    return () => clearInterval(t);
  }, [reducedMotion]);

  const text = reducedMotion ? PLACEHOLDERS[endpoint] : PLACEHOLDER_ROTATION[index];

  return (
    <span key={index} className="truncate font-mono text-[13px] text-m-ink/32 animate-text-swap-in" aria-hidden>
      {text}
    </span>
  );
}

/**
 * Pre-gate placeholder for the response panel: every quoted JSON value (not
 * keys) renders as glyph noise, matching ScrambleCode's mid-flight look, so
 * nothing readable leaks before the request finishes typing (research/17).
 * Reduced motion renders the real, settled response immediately instead.
 */
function ScrambledPlaceholder({ code }: { code: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const lines = React.useMemo(() => code.split('\n'), [code]);

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal">
      {lines.map((line, i) => (
        <div key={i}>{reducedMotion ? line : noiseLine(line)}</div>
      ))}
    </pre>
  );
}

function noiseLine(line: string): React.ReactNode {
  const parts = line.split(/("(?:[^"\\]|\\.)*")(\s*:)?/g);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const plain = parts[i];
    const quoted = parts[i + 1];
    const colon = parts[i + 2];
    if (plain) nodes.push(plain);
    if (quoted) {
      if (colon) {
        // JSON key: stays static, ink-coloured, never scrambles.
        nodes.push(
          <CodeToken key={i} kind="key">
            {quoted}
          </CodeToken>,
        );
        nodes.push(colon);
      } else {
        const inner = quoted.slice(1, -1);
        nodes.push(
          <CodeToken key={i} kind="string">
            {`"${randomGlyphString(Math.max(1, inner.length))}"`}
          </CodeToken>,
        );
      }
    }
  }
  return nodes;
}

/** Endpoint response preview shapes (lib/docs-content.ts response envelopes, trimmed for the hero). */
const RESPONSE_PREVIEW: Record<Endpoint, string> = {
  scrape: `{
  "success": true,
  "data": {
    "markdown": "# Pricing\\n...",
    "metadata": {
      "title": "Pricing",
      "sourceUrl": "https://example.com/pricing",
      "statusCode": 200,
      "tier": "plain"
    }
  },
  "warnings": []
}`,
  parse: `{
  "success": true,
  "data": {
    "markdown": "# Invoice 0142\\n...",
    "metadata": {
      "filename": "invoice.pdf",
      "fileType": "pdf",
      "ocrUsed": false,
      "fromCache": false
    }
  }
}`,
  search: `{
  "success": true,
  "data": {
    "web": [
      {
        "url": "https://example.com/best-email-apis",
        "title": "13 Best Transactional Email APIs",
        "position": 1
      }
    ]
  },
  "warnings": []
}`,
  map: `{
  "success": true,
  "data": {
    "urls": [
      "https://example.com/",
      "https://example.com/pricing"
    ]
  }
}`,
  crawl: `{
  "status": "running",
  "total": 100,
  "completed": 42,
  "data": [
    { "url": "https://example.com/blog/post-1" }
  ]
}`,
  interact: `{
  "success": true,
  "sessionId": "sess_9f2c1a7b",
  "output": "Keyboard available at $49.99",
  "actionsRun": 6
}`,
  monitor: `{
  "success": true,
  "status": "active",
  "nextCheckAt": "2026-08-24T13:00:00.000Z",
  "stats": { "checks": 0, "changes": 0 }
}`,
};
