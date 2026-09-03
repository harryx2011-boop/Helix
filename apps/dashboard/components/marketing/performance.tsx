import { Layers, Coins, ShieldAlert, Gauge } from 'lucide-react';
import { FrameBand } from './section-frame';
import { CodeRain } from './ambient';
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

const SIGNAL_LOG = `▸ GET /pricing   plain       403    5ms   cloudflare-mitigated
▸ GET /pricing   tls         403   51ms   challenge-platform
● error: FetchFailure   signals: 2   next: lightpanda`;

/** Home §3: what the ladder costs, what the model receives, what a block looks like. Bento of four. */
export function Performance() {
  return (
    <section className="px-6 py-16 sm:px-10">
      <FrameBand step="03" total="07" label="PERFORMANCE" sub="Cheapest path, honest failures" />

      <div className="py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <CodeRain
            cols={22}
            rows={6}
            density={0.4}
            seed={97}
            className="hidden -inset-y-10 -inset-x-24 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_46%,black_66%,transparent_100%)]"
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
            eyebrow="Cheapest tier wins"
            lead="Escalates on evidence."
            body="A plain fetch answers most pages. TLS identity, a light browser and Chromium only run once a block is proven."
            span="wide"
          >
            <MeterPanel label="resolved at tier · sample instance" rows={TIER_ROWS} seed={11} />
          </BentoCard>

          <BentoCard
            icon={Coins}
            eyebrow="Token-efficient"
            lead="Only the content that matters."
            body="Nav, footer and ads are dropped before your model sees the page."
            span="narrow"
          >
            <MeterPanel label="extraction ratio" rows={TOKEN_ROWS} size="thin" jitter={1} seed={19} />
          </BentoCard>

          <BentoCard
            icon={ShieldAlert}
            eyebrow="Honest about blocks"
            lead="A block is a typed failure."
            body="A challenge page returning 200 never comes back as markdown."
            span="narrow"
          >
            <div className="overflow-x-auto rounded-panel border border-m-border-muted bg-m-bg px-3 py-3">
              <pre className="whitespace-pre font-mono text-[11px] leading-[1.7] text-m-ink/64">{SIGNAL_LOG}</pre>
            </div>
          </BentoCard>

          <BentoCard
            icon={Gauge}
            eyebrow="Adaptive politeness"
            lead="Per-host concurrency ramps and backs off."
            body="A 429 lowers the ceiling for that host alone. The rest of the crawl keeps its pace."
            span="wide"
          >
            <MeterPanel label="per-host concurrency · live" rows={HOST_ROWS} jitter={6} seed={29} />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
