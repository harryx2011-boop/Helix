'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Format } from '@/lib/api';
import { generateCode, type Lang } from '@/lib/codegen';
import { EXAMPLE_REQUEST } from '@/lib/catalog';
import type { Endpoint } from '@/lib/endpoints';
import { DEFAULT_FORMATS } from '@/lib/formats';
import { PromptBox } from '@/components/playground/prompt-box';
import { AnimatedCode, randomGlyphString, usePrefersReducedMotion } from './animated-code';
import { CodeToken } from './code-panel';
import { LadderExplainer } from './ladder-explainer';

/** Deterministic fill for the pre-mount scramble placeholder — same glyph on server and client. */
const NOISE_GLYPH = '░';

/**
 * WEBSITE.md §4.2 hero panel + research/17 prompt-box anatomy: the shared
 * PromptBox (group-labelled endpoint track, URL row, toolbar) over a
 * generated request that types itself and a response that scrambles in, then
 * the ladder explainer below. Submit hands the value to the playground.
 * Composes only — never fetches.
 */
export function HeroPanel({ id }: { id?: string }) {
  const router = useRouter();
  const [url, setUrl] = React.useState('');
  const [endpoint, setEndpoint] = React.useState<Endpoint>('scrape');
  const [formats, setFormats] = React.useState<Format[]>([...DEFAULT_FORMATS]);
  const [playKey, setPlayKey] = React.useState<number | undefined>(undefined);
  const [requestKey, setRequestKey] = React.useState(0);
  // Response scramble only starts once the request finishes typing (research/17):
  // gated by requestDone, and re-keyed only when the request itself re-types.
  const [requestDone, setRequestDone] = React.useState(false);

  const lang: Lang = 'curl';
  const body = {
    ...EXAMPLE_REQUEST[endpoint],
    ...(endpoint === 'scrape' ? { formats } : {}),
    ...(url ? { url } : {}),
  };
  const code = generateCode(lang, { endpoint, body });
  const response = RESPONSE_PREVIEW[endpoint];

  const handleRequestDone = React.useCallback(() => setRequestDone(true), []);

  const retype = () => {
    setRequestDone(false);
    setRequestKey((k) => k + 1);
  };

  function handleSubmit() {
    const params = new URLSearchParams({ tab: endpoint });
    if (url.trim()) params.set('url', url.trim());
    router.push(`/app/playground?${params.toString()}`);
  }

  function selectEndpoint(id: string) {
    setEndpoint(id as Endpoint);
    retype();
  }

  function selectFormats(next: Format[]) {
    setFormats(next);
    retype();
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
      <div className="relative z-10 mx-auto -mb-6 w-full min-w-0 max-w-[640px]">
        <PromptBox
          variant="hero"
          activeId={endpoint}
          onSelectTab={selectEndpoint}
          value={url}
          onValueChange={setUrl}
          onSubmit={handleSubmit}
          loading={false}
          disabled={false}
          formats={formats}
          onFormatsChange={selectFormats}
        />
      </div>

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
  document: `{
  "success": true,
  "data": {
    "op": "parse",
    "markdown": "# Invoice 0142\n...",
    "metadata": {
      "filename": "invoice.pdf",
      "pageCount": 2,
      "ocrUsed": false
    }
  }
}`,
  extract: `{
  "success": true,
  "data": [
    {
      "plan": "Pro",
      "monthlyPrice": 79,
      "_source": { "url": "…/pricing", "span": [1204, 1261] }
    }
  ],
  "dropped": []
}`,
  screenshot: `{
  "success": true,
  "data": {
    "screenshot": "https://cdn.helix.sh/s/9f2c….png",
    "width": 1440,
    "height": 5120,
    "format": "png"
  }
}`,
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
  convert: `200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="report.png"

<PNG bytes>`,
};
