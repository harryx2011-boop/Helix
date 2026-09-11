import { Layers, Coins, OctagonX, Activity, Cpu } from 'lucide-react';
import { FrameBand } from './section-frame';
import { AsciiFlow } from './ascii-fields';
import { MeterPanel } from './meter';
import { BentoCard } from './bento';

const TIER_ROWS = [
  { label: 'plain', value: 71, accent: true },
  { label: 'tls', value: 18 },
  { label: 'lightpanda', value: 8 },
  { label: 'chromium', value: 3 },
];

const TOKEN_ROWS = [
  { label: 'raw html', value: 100, display: '14.2 kb' },
  { label: 'markdown', value: 15, accent: true, display: '2.1 kb' },
  { label: 'tokens', value: 7, accent: true, display: '-93%' },
];

const HOST_ROWS = [
  { label: 'example.com', value: 75, accent: true },
  { label: 'docs.example', value: 38 },
  { label: 'cdn.example', value: 12 },
];

const TRACE_ROWS = [
  { tier: 'plain', status: 403, ms: 5, signal: 'cloudflare-mitigated' },
  { tier: 'tls', status: 403, ms: 51, signal: 'challenge-platform' },
];

/** One blocked request, tier by tier, ending in the typed failure the caller receives. Sample data, labelled as such. */
function TraceTable() {
  return (
    <div className="overflow-hidden rounded-panel border border-m-border-muted bg-m-bg">
      <div className="flex items-center gap-2 border-b border-m-border-faint px-3 py-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-m-ink/24" aria-hidden />
        <span className="truncate font-mono text-[11px] text-m-ink/48">GET example.com/pricing · sample trace</span>
      </div>
      <table className="w-full font-mono text-[11px] tabular-nums">
        <thead>
          <tr className="text-m-ink/48">
            <th scope="col" className="px-3 py-1.5 text-left font-normal">tier</th>
            <th scope="col" className="px-2 py-1.5 text-left font-normal">status</th>
            <th scope="col" className="px-2 py-1.5 text-right font-normal">ms</th>
            <th scope="col" className="hidden px-3 py-1.5 text-left font-normal lg:table-cell">signal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-m-border-faint border-t border-m-border-faint text-m-ink/72">
          {TRACE_ROWS.map((row) => (
            <tr key={row.tier}>
              <td className="px-3 py-2 text-m-ink">{row.tier}</td>
              <td className="px-2 py-2">{row.status}</td>
              <td className="px-2 py-2 text-right">{row.ms}</td>
              <td className="hidden truncate px-3 py-2 lg:table-cell">{row.signal}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-m-border-faint px-3 py-2 font-mono text-[11px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet" aria-hidden />
        <span className="text-m-ink">FetchFailure</span>
        <span className="truncate text-m-ink/48">signals: 2 · next: lightpanda</span>
      </div>
    </div>
  );
}

/** Home §3: what the ladder costs, what the model receives, what a block looks like. One hero cell, three beneath. */
export function Performance() {
  return (
    <section className="relative overflow-hidden px-6 py-16 sm:px-10">
      <FrameBand step="03" icon={Cpu} />

      <div className="relative py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <AsciiFlow
            cols={120}
            rows={18}
            seed={97}
            className="absolute -inset-x-24 -inset-y-10 hidden overflow-hidden opacity-80 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_40%,black_68%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Fast where it can be,
              <br />
              <span className="text-violet">honest where it can&rsquo;t.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
              Every request explains what it cost and why. Nothing is retried in the dark.
            </p>
          </div>
        </div>

        <div
          data-reveal-group
          className="mt-10 grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm sm:grid-cols-6"
        >
          <BentoCard
            icon={Layers}
            lead="Escalates on evidence."
            body="A plain fetch answers most pages. TLS identity, a light browser and Chromium only run once a block is proven."
            span="hero"
            href="/architecture"
            linkLabel="How the ladder decides"
          >
            <MeterPanel label="resolved at tier · sample instance" rows={TIER_ROWS} />
          </BentoCard>

          <BentoCard
            icon={Coins}
            lead="Only the content that matters."
            body="Nav, footer and ads are dropped before your model sees the page."
            span="third"
            href="/scrape"
            linkLabel="What Scrape returns"
          >
            <MeterPanel label="extraction ratio" rows={TOKEN_ROWS} size="thin" />
          </BentoCard>

          <BentoCard
            icon={OctagonX}
            lead="A block is a typed failure."
            body="A challenge page returning 200 never comes back as markdown."
            span="third"
            href="/docs/api-reference"
            linkLabel="Every failure reason"
          >
            <TraceTable />
          </BentoCard>

          <BentoCard
            icon={Activity}
            lead="Per-host concurrency ramps and backs off."
            body="A 429 lowers the ceiling for that host alone. The rest of the crawl keeps its pace."
            span="third"
            href="/crawl"
            linkLabel="How Crawl paces itself"
          >
            <MeterPanel label="per-host concurrency · sample instance" rows={HOST_ROWS} />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
