import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PillButton } from '@/components/shared/pill-button';
import { CodePanel } from '@/components/shared/code-panel';
import { AnimatedCode } from '@/components/shared/animated-code';
import { BentoCard } from '@/components/marketing/bento';
import { HeroField, type HeroMotif } from '@/components/marketing/hero-field';
import { ScrollStrip } from '@/components/marketing/scroll-strip';
import { FEATURE_BY_ID, type FeatureId } from '@/lib/feature-copy';

const MOTIFS: readonly HeroMotif[] = ['cloud', 'orbit', 'wave', 'flow'];

function seedFor(id: string): number {
  let s = 0;
  for (const ch of id) s += ch.charCodeAt(0);
  return s;
}

export function featureMetadata(id: FeatureId): Metadata {
  const f = FEATURE_BY_ID[id];
  return { title: f.title, description: f.description };
}

/** Bento rhythm: wide / narrow, then narrow / wide. */
const SPAN: ('wide' | 'narrow')[] = ['wide', 'narrow', 'narrow', 'wide'];

/** One page per thing Helix does: a plain headline, a sample result, four short points, a link to the technical page. */
export function FeaturePage({ id }: { id: FeatureId }) {
  const f = FEATURE_BY_ID[id];
  const seed = seedFor(id);

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif={MOTIFS[seed % MOTIFS.length]!} seed={seed} />
        <section className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="mt-2 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            <span className="block">{f.h1[0]}</span>
            <span className="block text-violet">{f.h1[1]}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">{f.subhead}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="/download" variant="primary">
              Get the app <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
            <PillButton href="/docs/how-it-works" variant="secondary">
              How it works
            </PillButton>
          </div>
        </section>
      </div>

      <section className="relative mx-auto mt-14 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <div className="pointer-events-none absolute inset-0 rounded-panel shadow-cutout" aria-hidden />
        <CodePanel chrome={f.mock.chrome} label={f.mock.label}>
          <AnimatedCode
            code={f.mock.code}
            mode="reveal"
            charMs={14}
            lineMs={55}
            playOnView
            {...(f.mock.chrome === 'terminal' ? { className: 'text-foreground' } : {})}
          />
        </CodePanel>
      </section>

      <section className="mx-auto mt-20 max-w-[960px]">
        <div data-reveal-group className="grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm sm:grid-cols-6">
          {f.cards.map((card, i) => (
            <BentoCard key={card.lead} icon={card.icon} lead={card.lead} body={card.body} span={SPAN[i % SPAN.length]!} />
          ))}
        </div>
      </section>

      <ScrollStrip seed={seed} direction={seed % 2 ? 'left' : 'right'} className="mt-16" />

      <section className="mx-auto mt-12 max-w-[720px] text-center">
        <p className="text-[15px] leading-relaxed text-m-ink/72">
          Building on top of Helix? The{' '}
          <Link href={f.docs} className="text-violet underline decoration-violet-40 underline-offset-4">
            technical page for this feature
          </Link>{' '}
          lists every option.
        </p>
      </section>
    </div>
  );
}
