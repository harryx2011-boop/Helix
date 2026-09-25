'use client';

import * as React from 'react';
import { PackageCheck, KeyRound, Scale, Receipt, Server } from 'lucide-react';
import { FrameBand } from './section-frame';
import { PillButton } from '@/components/shared/pill-button';
import { TerminalReplay } from './terminal-replay';
import { AmbientCode, CodeRain } from '@/components/shared/ambient';
import { Segmented } from '@/components/shared/segmented';
import { IconTile } from './icon-tile';
import { GITHUB_URL } from '@/lib/github-stars';

type ClaimId = 'tiers' | 'keys' | 'license' | 'cost';

interface Claim {
  id: ClaimId;
  label: string;
  icon: typeof PackageCheck;
  lead: string;
  body: string;
  evidence: string;
}

const CLAIMS: Claim[] = [
  {
    id: 'tiers',
    label: 'Every tier',
    icon: PackageCheck,
    lead: 'Every tier included.',
    body: 'Stealth, TLS identity and headless Chromium ship in the self-host build, not a cloud-only add-on.',
    evidence: '"tier": "lightpanda"  ·  200  ·  24ms',
  },
  {
    id: 'keys',
    label: 'Your keys',
    icon: KeyRound,
    lead: 'Your keys, your provider.',
    body: 'LLM extraction runs on your own model key. No vendor credits, no margin on top of it.',
    evidence: 'HELIX_LLM_PROVIDER=openai',
  },
  {
    id: 'license',
    label: 'License',
    icon: Scale,
    lead: 'Apache-2.0, not AGPL.',
    body: 'Fork it, embed it, ship it inside your own product without asking permission.',
    evidence: 'LICENSE  Apache-2.0',
  },
  {
    id: 'cost',
    label: 'Cost before commit',
    icon: Receipt,
    lead: 'Cost before commit.',
    body: '`estimate: true` returns the page count and cost before any crawl runs.',
    evidence: '{ "estimate": { "pages": 100, "cost": 0 } }',
  },
];

const CLAIM_TAB_ITEMS = CLAIMS.map((c) => ({ id: c.id, label: c.label, icon: c.icon }));

/** Tabbed claims: one strip switches between the four self-host proofs, evidence shown for the active tab. */
function ClaimTabs() {
  const [active, setActive] = React.useState<ClaimId>('tiers');
  const claim = CLAIMS.find((c) => c.id === active) ?? CLAIMS[0]!;

  return (
    <div data-reveal className="mt-8">
      <div className="overflow-x-auto">
        <Segmented items={CLAIM_TAB_ITEMS} value={active} onChange={setActive} aria-label="Self-host claim" className="mx-auto" />
      </div>
      <div className="mt-4 flex flex-col items-start gap-4 rounded-panel border border-m-border-muted bg-m-surface p-5 text-left sm:flex-row sm:items-center sm:gap-5 sm:p-6">
        <IconTile icon={claim.icon} />
        <p className="min-w-0 flex-1 text-[15px] leading-relaxed">
          <span className="font-medium text-m-ink">{claim.lead}</span> <span className="text-m-ink/64">{claim.body}</span>
        </p>
        <div className="w-full min-w-0 overflow-x-auto rounded-card bg-m-bg px-3 py-1.5 sm:w-auto sm:max-w-[320px]">
          <span className="whitespace-pre font-mono text-[12px] text-m-ink/48">{claim.evidence}</span>
        </div>
      </div>
    </div>
  );
}

/** WEBSITE.md §4.5: centerpiece section. Centered header w/ ambient code texture, terminal replay, tabbed claims. */
export function SelfHostPromise() {
  return (
    <section className="relative overflow-hidden bg-m-bg-lighter px-6 py-16 sm:px-10">
      <FrameBand step="05" icon={Server} />

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
              The self-host build is the whole product, not a stripped-down trial.
            </p>
          </div>
        </div>

        <div data-reveal className="mt-12">
          <TerminalReplay />
        </div>

        <ClaimTabs />

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton href="/self-host" variant="primary">
            Read the self-host guide
          </PillButton>
          <PillButton href={GITHUB_URL} variant="secondary">
            View on GitHub
          </PillButton>
        </div>
      </div>
    </section>
  );
}
