'use client';

import * as React from 'react';
import { ArrowRight, FileScan, Globe, Map as MapIcon, Network, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateCode, type Lang } from '@/lib/codegen';
import { EXAMPLE_REQUEST } from '@/lib/catalog';
import type { Endpoint } from '@/lib/endpoints';
import { AnimatedCode, randomGlyphString, usePrefersReducedMotion } from './animated-code';
import { CodeToken } from './code-panel';
import { LadderExplainer } from './ladder-explainer';

/** Deterministic fill for the pre-mount scramble placeholder — same glyph on server and client. */
const NOISE_GLYPH = '░';

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
    <div id={id} className="mx-auto w-full min-w-0 max-w-full lg:max-w-[960px]">
      <form
        onSubmit={handleSubmit}
        className="relative z-10 mx-auto -mb-6 w-full min-w-0 max-w-[560px] overflow-hidden rounded-panel bg-m-surface shadow-card"
      >
        <div className="flex min-w-0 items-center gap-2 border-b border-m-border-faint px-4 py-3.5">
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
        </div>

        <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-pill bg-m-bg p-1">
            {HERO_ENDPOINTS.map((e, i) => {
              const Icon = e.icon;
              const active = endpoint === e.id;
              return (
                <React.Fragment key={e.id}>
                  {i > 0 && <span className="h-4 w-px shrink-0 bg-m-border-muted" aria-hidden />}
                  <button
                    type="button"
                    onClick={() => selectEndpoint(e.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-mono text-[13px] transition-colors duration-150 ease-out',
                      active ? 'bg-m-surface text-m-ink shadow-card-sm' : 'text-m-ink/56 hover:text-m-ink/80',
                    )}
                    aria-pressed={active}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {e.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
          <button
            type="submit"
            aria-label="Compose the request"
            className="flex h-9 w-12 shrink-0 items-center justify-center rounded-card bg-violet text-white shadow-btn transition-shadow duration-200 ease-out hover:shadow-btn-hover"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </form>

      <div className="min-w-0 max-w-full overflow-hidden rounded-panel bg-m-surface shadow-card ring-8 ring-m-bg">
        <div className="grid min-w-0 max-w-full grid-cols-1 divide-m-border-faint pt-8 lg:grid-cols-2 lg:divide-x">
          <div className="w-full min-w-0 max-w-full overflow-x-auto border-b border-m-border-faint px-4 py-4 lg:border-b-0">
            <p className="mb-2 font-mono text-[11px] tracking-wide text-m-ink/48">[ REQUEST ]</p>
            <AnimatedCode key={`req-${requestKey}`} code={code} mode="type" charMs={14} playOnView={false} onDone={handleRequestDone} />
          </div>

          <div className="min-w-0 max-w-full px-4 py-4">
            <p className="mb-2 font-mono text-[11px] tracking-wide text-m-ink/48">[ RESPONSE ]</p>
            <div className="w-full min-w-0 max-w-full overflow-x-auto">
              {requestDone ? (
                <AnimatedCode key={`res-${requestKey}`} code={response} mode="scramble" resolveMs={2200} loop playOnView />
              ) : (
                <ScrambledPlaceholder code={response} />
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 max-w-full border-t border-m-border-faint bg-m-bg-lighter px-4 py-4">
          {playKey === undefined ? <LadderExplainer /> : <LadderExplainer playKey={playKey} />}
        </div>
      </div>
    </div>
  );
}

const HERO_ENDPOINTS: { id: Endpoint; name: string; icon: typeof Globe }[] = [
  { id: 'scrape', name: 'Scrape', icon: Globe },
  { id: 'search', name: 'Search', icon: Search },
  { id: 'map', name: 'Map', icon: MapIcon },
  { id: 'crawl', name: 'Crawl', icon: Network },
  { id: 'parse', name: 'Parse', icon: FileScan },
];

const PLACEHOLDERS: Record<Endpoint, string> = {
  scrape: 'https://example.com/pricing',
  parse: 'https://docs.stripe.com/webhooks',
  metadata: 'https://example.com/files/report.pdf',
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
  // Deterministic first paint: always start at index 0 (server and client agree).
  const [index, setIndex] = React.useState(0);
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
  // First paint (server + client) must be deterministic or React flags a
  // hydration mismatch on the random glyphs. Render a fixed seed on mount,
  // only randomize afterwards.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const randomize = mounted && !reducedMotion;

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal">
      {lines.map((line, i) => (
        <div key={i}>{reducedMotion ? line : noiseLine(line, randomize)}</div>
      ))}
    </pre>
  );
}

function noiseLine(line: string, randomize: boolean): React.ReactNode {
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
        const len = Math.max(1, inner.length);
        const noise = randomize ? randomGlyphString(len) : NOISE_GLYPH.repeat(len);
        nodes.push(
          <CodeToken key={i} kind="string">
            {`"${noise}"`}
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
  metadata: `{
  "success": true,
  "data": {
    "findings": [
      { "key": "GPSLatitude", "risk": "high", "category": "location" },
      { "key": "Artist", "risk": "high", "category": "identity" }
    ],
    "riskSummary": { "high": 2, "medium": 1, "low": 0 }
  }
}`,
};
