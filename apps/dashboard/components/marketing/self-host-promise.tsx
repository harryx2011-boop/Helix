import { ShieldCheck, KeyRound, Scale, Calculator } from 'lucide-react';
import { SectionEyebrow } from './section-eyebrow';
import { PillButton } from './pill-button';
import { TerminalReplay } from './terminal-replay';
import { AmbientCode } from './ambient';

const CLAIMS: {
  icon: typeof ShieldCheck;
  lead: string;
  rest: string;
  evidence: string;
}[] = [
  {
    icon: ShieldCheck,
    lead: 'Every tier included.',
    rest: 'Stealth, TLS identity and headless Chromium ship in the self-host build, not a cloud-only add-on.',
    evidence: '"tier": "lightpanda"  ·  200  ·  24ms',
  },
  {
    icon: KeyRound,
    lead: 'Your keys, your provider.',
    rest: 'LLM extraction runs on your own model key. No vendor credits, no margin on top of it.',
    evidence: 'HELIX_LLM_PROVIDER=openai',
  },
  {
    icon: Scale,
    lead: 'Apache-2.0, not AGPL.',
    rest: 'Fork it, embed it, ship it inside your own product without asking permission.',
    evidence: 'LICENSE  Apache-2.0',
  },
  {
    icon: Calculator,
    lead: 'Cost before commit.',
    rest: '`estimate: true` returns the page count and cost before any crawl runs.',
    evidence: '{ "estimate": { "pages": 100, "cost": 0 } }',
  },
];

/** WEBSITE.md §4.5: centerpiece section. Centered header w/ ambient code texture, terminal replay, 2x2 claim grid. */
export function SelfHostPromise() {
  return (
    <section className="relative overflow-hidden border-t border-m-border-faint bg-m-bg-lighter px-4 py-24">
      <div className="relative mx-auto max-w-container">
        <div data-reveal className="relative mx-auto max-w-[760px] px-6 py-6 text-center sm:px-10">
          <AmbientCode
            count={16}
            seed={23}
            className="hidden -inset-y-12 -inset-x-48 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_38%,black_58%,transparent_100%)]"
          />
          <div className="relative">
            <SectionEyebrow step="03 / 04" label="SELF-HOST" sub="Bring your own keys" />
            <h2 className="mx-auto mt-4 max-w-[520px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Fast, self-hosted, Apache-2.0.
              <br />
              <span className="text-violet">And it&rsquo;s all yours.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
              The self-host build is the product, not a stripped-down trial of the hosted one.
            </p>
          </div>
        </div>

        <div data-reveal className="mt-12">
          <TerminalReplay />
        </div>

        <div data-reveal-group className="mt-8 grid gap-5 sm:grid-cols-2">
          {CLAIMS.map((c) => (
            <div
              key={c.lead}
              data-reveal-item
              className="min-w-0 rounded-panel border border-m-border-muted bg-m-surface p-5 shadow-card-sm"
            >
              <p className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-wide text-m-ink/48">
                <c.icon className="h-3.5 w-3.5 shrink-0 text-violet" strokeWidth={1.75} aria-hidden />
                {c.lead}
              </p>
              <p className="mt-3 min-w-0 text-[15px] leading-relaxed">
                <span className="font-medium text-m-ink">{c.lead}</span>{' '}
                <span className="text-m-ink/64">{c.rest}</span>
              </p>
              <div className="mt-3 min-w-0 overflow-x-auto rounded-card bg-m-bg px-3 py-2">
                <span className="whitespace-pre font-mono text-[12px] text-m-ink/48">{c.evidence}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton href="/self-host" variant="primary">
            Read the self-host guide
          </PillButton>
          <PillButton href="https://github.com/helix-dev/helix" variant="secondary">
            View on GitHub
          </PillButton>
        </div>
      </div>
    </section>
  );
}
