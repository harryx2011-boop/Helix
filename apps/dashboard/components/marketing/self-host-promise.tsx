import { PackageCheck, KeyRound, Scale, Receipt, Server } from 'lucide-react';
import { FrameBand } from './section-frame';
import { PillButton } from './pill-button';
import { TerminalReplay } from './terminal-replay';
import { AmbientCode, CodeRain } from './ambient';
import { Ledger, type LedgerRow } from './ledger';

const CLAIMS: LedgerRow[] = [
  {
    icon: PackageCheck,
    lead: 'Every tier included.',
    body: 'Stealth, TLS identity and headless Chromium ship in the self-host build, not a cloud-only add-on.',
    evidence: '"tier": "lightpanda"  ·  200  ·  24ms',
  },
  {
    icon: KeyRound,
    lead: 'Your keys, your provider.',
    body: 'LLM extraction runs on your own model key. No vendor credits, no margin on top of it.',
    evidence: 'HELIX_LLM_PROVIDER=openai',
  },
  {
    icon: Scale,
    lead: 'Apache-2.0, not AGPL.',
    body: 'Fork it, embed it, ship it inside your own product without asking permission.',
    evidence: 'LICENSE  Apache-2.0',
  },
  {
    icon: Receipt,
    lead: 'Cost before commit.',
    body: '`estimate: true` returns the page count and cost before any crawl runs.',
    evidence: '{ "estimate": { "pages": 100, "cost": 0 } }',
  },
];

/** WEBSITE.md §4.5: centerpiece section. Centered header w/ ambient code texture, terminal replay, claims ledger. */
export function SelfHostPromise() {
  return (
    <section className="relative overflow-hidden bg-m-bg-lighter px-6 py-16 sm:px-10">
      <FrameBand step="05" total="07" label="SELF-HOST" sub="Bring your own keys" icon={Server} />

      <div className="relative py-16">
        <div data-reveal className="relative mx-auto max-w-[760px] px-6 py-6 text-center">
          <AmbientCode
            count={16}
            seed={23}
            className="hidden -inset-y-12 -inset-x-32 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_58%,black_74%,transparent_100%)]"
          />
          <CodeRain
            cols={14}
            rows={4}
            density={0.2}
            seed={53}
            className="hidden -inset-y-6 -inset-x-16 lg:block [mask-image:radial-gradient(ellipse_at_center,transparent_45%,black_66%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[520px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
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

        <Ledger rows={CLAIMS} className="mt-8" />

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
