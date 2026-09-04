import { cn } from '@/lib/utils';

/** Same generator as `ambient.tsx`, copied because that module is client-only and this one renders on the server. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * CodeGutters: two columns of wire-format lines in the page margins outside
 * the container, scrolling upward on a CSS marquee. Server-rendered and
 * seeded, so the first paint is deterministic and the only runtime cost is
 * one composited transform per column. Hidden below xl, where there is no
 * margin to fill; static under reduced motion.
 */

const LINES = [
  'POST /v1/scrape',
  '{ "url": "https://example.com" }',
  '"formats": ["markdown", "json"]',
  '"tier": "plain"',
  '"statusCode": 200',
  '▸ GET /pricing  plain  200  5ms',
  '▸ GET /docs     tls    200  51ms',
  '● FetchFailure  signals: 2',
  '"markdown": "# Pricing\\n..."',
  '"jsonOptions": { "prompt": "..." }',
  '"warnings": []',
  '202 Accepted',
  '"jobId": "6f1c…"',
  '"nextCheckAt": "13:00:00Z"',
  '"riskSummary": { "high": 1 }',
  '"removable": true',
  'HELIX_LLM_PROVIDER=openai',
  '"estimate": { "pages": 100 }',
  '{ "success": true }',
  '"tier": "lightpanda"  ·  24ms',
  'Authorization: Bearer helix-…',
  '"actionsRun": 3',
  '"sessionId": "sess_9f2c"',
  '-> markdown  2.1 kb  -93%',
  '"schedule": "0 * * * *"',
  '"urls": ["/", "/pricing"]',
  '0x1f  [ ]  { }',
  'robots: allowed',
  '"ocrUsed": false',
  '"fromCache": true',
];

const LINE_COUNT = 72;

function buildColumn(seed: number): { text: string; violet: boolean; indent: number }[] {
  const rng = mulberry32(seed);
  return Array.from({ length: LINE_COUNT }, () => ({
    text: LINES[Math.floor(rng() * LINES.length)]!,
    violet: rng() < 0.12,
    indent: Math.floor(rng() * 3),
  }));
}

function Column({ seed, className }: { seed: number; className?: string }) {
  const lines = buildColumn(seed);
  const block = (
    <div>
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn('whitespace-pre', l.violet ? 'text-violet-48' : 'text-m-illus')}
          style={{ paddingLeft: `${l.indent * 12}px` }}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-y-0 -z-10 hidden w-[calc((100vw-1112px)/2-40px)] max-w-[220px] select-none overflow-hidden font-mono text-[11px] leading-[1.9] xl:block',
        '[mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]',
        className,
      )}
      aria-hidden="true"
    >
      <div className="animate-gutter-scroll motion-reduce:animate-none">
        {block}
        {block}
      </div>
    </div>
  );
}

export function CodeGutters() {
  return (
    <>
      <Column seed={101} className="left-6" />
      <Column seed={202} className="right-6 text-right [&_div]:!pl-0 [&_div]:pr-0" />
    </>
  );
}
