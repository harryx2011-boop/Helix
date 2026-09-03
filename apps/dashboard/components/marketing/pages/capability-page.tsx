import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { PillButton } from '@/components/marketing/pill-button';
import { CodePanel } from '@/components/marketing/code-panel';
import { AnimatedCode, type AnimatedCodeMode } from '@/components/marketing/animated-code';
import { BentoCard, EvidenceChip } from '@/components/marketing/bento';
import { MeterPanel, type MeterRow } from '@/components/marketing/meter';
import { endpointById } from '@/lib/catalog';
import type { Endpoint } from '@/lib/endpoints';

/** Per-endpoint mock animation: type = content composing, reveal = results listing. */
const MOCK_MODE: Record<Endpoint, AnimatedCodeMode> = {
  scrape: 'type',
  parse: 'type',
  metadata: 'reveal',
  search: 'reveal',
  map: 'reveal',
  crawl: 'reveal',
  interact: 'reveal',
  monitor: 'reveal',
};

export interface FeatureCardCopy {
  icon: LucideIcon;
  eyebrow: string;
  lead: string;
  body: string;
  evidence?: string;
  /** When set, the cell renders a live meter panel labelled by `evidence` instead of the evidence chip. */
  meters?: MeterRow[];
  meterSize?: 'pill' | 'thin';
  meterJitter?: number;
}

export interface CapabilityPageCopy {
  endpoint: Endpoint;
  /** Second line of the H1 renders in violet. */
  h1: [string, string];
  subhead: string;
  /** Mock panel: browser-chrome or terminal-chrome, per WEBSITE.md §5's Mock column. */
  mock: {
    chrome: 'browser' | 'terminal';
    label: string;
    code: string;
  };
  features: FeatureCardCopy[];
  /** Verbatim request/response pair — from openapi.yaml for live endpoints, the spec for coming ones. */
  request: string;
  response: string;
}

/**
 * The §5 capability-page template, six instances. Structure: eyebrow pill,
 * two-line H1 (line 2 violet), subhead, CTA pair, device mock, feature grid,
 * request/response block. The layout supplies nav/footer/agent-block.
 */
export function CapabilityPage({ endpoint, h1, subhead, mock, features, request, response }: CapabilityPageCopy) {
  const def = endpointById(endpoint);
  if (!def) return null;
  const isComing = def.status === 'coming';

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <section className="mx-auto max-w-[720px] animate-fade-up text-center">
        {isComing && (
          <span className="rounded-pill bg-violet-12 px-2.5 py-1 font-mono text-[12px] tracking-wide text-violet">
            coming
          </span>
        )}

        <h1 className="mt-2 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
          <span className="block">{h1[0]}</span>
          <span className="block text-violet">{h1[1]}</span>
        </h1>

        <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">{subhead}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {isComing ? (
            <PillButton href="/sign-up" variant="primary">
              Notify me <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
          ) : (
            <PillButton href={`/app/playground?tab=${def.id}`} variant="primary">
              Open in playground <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
          )}
          <PillButton href={`/docs/${def.id}`} variant="secondary">
            Read the docs
          </PillButton>
        </div>
      </section>

      <section className="relative mx-auto mt-14 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <div className="pointer-events-none absolute inset-0 rounded-panel shadow-cutout" aria-hidden />
        <CodePanel chrome={mock.chrome} label={mock.label}>
          <AnimatedCode
            code={mock.code}
            mode={MOCK_MODE[endpoint]}
            charMs={14}
            lineMs={55}
            playOnView
            {...(mock.chrome === 'terminal' ? { className: 'text-foreground' } : {})}
          />
        </CodePanel>
      </section>

      <section className="mx-auto mt-20 max-w-[960px]">
        <div className="grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm sm:grid-cols-6">
          {features.map((feature, i) => (
            <FeatureCell key={feature.eyebrow} {...feature} index={i} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-[960px] animate-fade-up">
        <SectionEyebrow step="REQUEST" label="WIRE FORMAT" sub={isComing ? 'planned shape' : 'from openapi.yaml'} />
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel chrome="terminal" label={`${def.method} ${def.path}`} copyText={request}>
            <AnimatedCode code={request} mode="static" className="text-foreground" />
          </CodePanel>
          <CodePanel chrome="terminal" label="response">
            <AnimatedCode code={response} mode="scramble" resolveMs={2200} playOnView className="text-foreground" />
          </CodePanel>
        </div>
      </section>
    </div>
  );
}

/** Bento rhythm: wide / narrow, then narrow / wide. */
const SPAN: ('wide' | 'narrow')[] = ['wide', 'narrow', 'narrow', 'wide'];

function FeatureCell({ icon, eyebrow, lead, body, evidence, meters, meterSize, meterJitter, index }: FeatureCardCopy & { index: number }) {
  return (
    <BentoCard
      icon={icon}
      eyebrow={eyebrow}
      lead={lead}
      body={body}
      span={SPAN[index % SPAN.length]!}
      className="animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {meters ? (
        <MeterPanel
          rows={meters}
          seed={index * 13 + 5}
          {...(evidence ? { label: evidence } : {})}
          {...(meterSize ? { size: meterSize } : {})}
          {...(meterJitter !== undefined ? { jitter: meterJitter } : {})}
        />
      ) : evidence ? (
        <EvidenceChip>{evidence}</EvidenceChip>
      ) : null}
    </BentoCard>
  );
}
