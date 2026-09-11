import type { Metadata } from 'next';
import { ArrowRight, Quote, CircleSlash, ShieldCheck, Layers } from 'lucide-react';
import { PillButton } from '@/components/marketing/pill-button';
import { CodePanel } from '@/components/marketing/code-panel';
import { AnimatedCode } from '@/components/marketing/animated-code';
import { BentoCard, EvidenceChip } from '@/components/marketing/bento';
import { MeterPanel } from '@/components/marketing/meter';
import { HeroField } from '@/components/marketing/hero-field';
import { ScrollStrip } from '@/components/marketing/scroll-strip';
import { AsciiOrbit } from '@/components/marketing/ascii-fields';

export const metadata: Metadata = {
  title: 'Enrichment API',
  description: 'A company name or domain in, grounded columns out. Every value cites the passage that states it; anything unverifiable is null with a reason.',
};

/* Request and response mirror POST /enrich in openapi.yaml. */
const REQUEST = `POST /v1/enrich
{
  "subject": "Acme Robotics",
  "fields": [
    { "name": "headquarters", "description": "City of the head office" },
    { "name": "foundedYear", "type": "number" },
    { "name": "isPublic", "type": "boolean" }
  ],
  "maxSources": 4,
  "timeout": 30000
}

# or from pages you already have
{
  "subject": "Acme Robotics",
  "urls": ["https://acme.example/about"],
  "fields": [{ "name": "headquarters" }]
}`;

const RESPONSE = `{
  "success": true,
  "subject": "Acme Robotics",
  "data": {
    "headquarters": {
      "value": "Zürich",
      "confidence": "medium",
      "citation": {
        "url": "https://acme.example/about",
        "quote": "Acme Robotics is headquartered in Zürich, Switzerland.",
        "locator": "body"
      },
      "phase": "model",
      "reason": null,
      "evidence": { "valueInCitation": true, "sourcesConsidered": 3 }
    },
    "foundedYear": {
      "value": 2014,
      "confidence": "high",
      "citation": {
        "url": "https://acme.example/about",
        "quote": "\\"foundingDate\\": \\"2014\\"",
        "locator": "ld+json Organization.foundingDate"
      },
      "phase": "metadata",
      "reason": null,
      "evidence": { "valueInCitation": true, "sourcesConsidered": 3 }
    },
    "isPublic": {
      "value": null,
      "confidence": null,
      "citation": null,
      "phase": null,
      "reason": "not_stated",
      "evidence": { "valueInCitation": false, "sourcesConsidered": 3 }
    }
  },
  "sources": {
    "used": ["https://acme.example/about", "https://acme.example/press", "https://news.example/acme-2024"],
    "rejected": [
      { "url": "https://linkedin.com/company/acme", "reason": "blocklisted_social", "detail": "…" }
    ]
  },
  "usage": { "tokens": { "input": 6210, "output": 188 }, "model": "…" }
}`;

const MOCK = `$ curl -X POST localhost:7400/v1/enrich \\
    -H 'Authorization: Bearer helix-...' \\
    -d '{"subject":"Acme Robotics","fields":[{"name":"headquarters"},{"name":"foundedYear","type":"number"},{"name":"isPublic","type":"boolean"}]}'

{
  "success": true,
  "data": {
    "headquarters": { "value": "Zürich", "confidence": "medium", "citation": { "url": "…/about", "quote": "…" }, "phase": "model" },
    "foundedYear":  { "value": 2014,     "confidence": "high",   "citation": { "url": "…/about", "quote": "…" }, "phase": "metadata" },
    "isPublic":     { "value": null,     "reason": "not_stated" }
  },
  "sources": { "used": [ … ], "rejected": [ … ] }
}`;

const FEATURES = [
  { icon: Quote, lead: 'Every value cites the passage that states it.', body: 'The model must quote its source; the quote is checked against the fetched page and the value against the quote. A claim that fails either check is null, not a guess.', evidence: 'fields by outcome · sample run', meters: [
    { label: 'grounded', value: 71, accent: true },
    { label: 'not_stated', value: 22 },
    { label: 'rejected', value: 7 },
  ] },
  { icon: CircleSlash, lead: 'A closed set you can branch on.', body: 'not_stated, no_citation, value_not_in_citation, model_unavailable and five more. No field is ever invented to fill a column.', evidence: '"value": null · "reason": "not_stated"' },
  { icon: Layers, lead: 'Meta tags and JSON-LD before a model.', body: 'A value a page states in its metadata is read directly and costs no tokens. Only what structure cannot answer goes to the model.', evidence: '"phase": "metadata" · "confidence": "high"' },
  { icon: ShieldCheck, lead: 'Parked domains and placeholder pages are rejected.', body: 'Every candidate passes guardrails before it can be evidence. Each rejection is listed in sources.rejected with the rule that discarded it.', evidence: 'candidate pages · sample run', meterSize: 'thin' as const, meters: [
    { label: 'used', value: 60, accent: true },
    { label: 'blocklisted', value: 20 },
    { label: 'below floor', value: 13 },
    { label: 'unreadable', value: 7 },
  ] },
];

const SPAN: ('wide' | 'narrow')[] = ['wide', 'narrow', 'narrow', 'wide'];
const SEED = 'enrich'.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);

export default function EnrichPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="wave" seed={SEED} />
        <section className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="mt-2 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            <span className="block">A name in,</span>
            <span className="block text-violet">columns with citations out.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
            Name the subject and the fields. Each comes back with the passage that states it, or null with the reason it could not be tied to a page Helix read.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="/sign-up" variant="primary">
              Get an API key <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
            <PillButton href="/docs/api-reference" variant="secondary">
              Read the docs
            </PillButton>
          </div>
        </section>
      </div>

      <section className="relative mx-auto mt-14 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <div className="pointer-events-none absolute inset-0 rounded-panel shadow-cutout" aria-hidden />
        <CodePanel chrome="terminal" label="$ helix enrich">
          <AnimatedCode code={MOCK} mode="reveal" charMs={14} lineMs={55} playOnView className="text-foreground" />
        </CodePanel>
      </section>

      <section className="mx-auto mt-20 max-w-[960px]">
        <div data-reveal-group className="grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm sm:grid-cols-6">
          {FEATURES.map((feature, i) => (
            <BentoCard key={i} icon={feature.icon} lead={feature.lead} body={feature.body} span={SPAN[i % SPAN.length]!}>
              {feature.meters ? (
                <MeterPanel rows={feature.meters} label={feature.evidence} {...(feature.meterSize ? { size: feature.meterSize } : {})} />
              ) : (
                <EvidenceChip>{feature.evidence}</EvidenceChip>
              )}
            </BentoCard>
          ))}
        </div>
      </section>

      <ScrollStrip seed={SEED} direction={SEED % 2 ? 'left' : 'right'} className="mt-16" />

      <section className="mx-auto mt-16 max-w-[960px] animate-fade-up">
        <div className="relative">
          <AsciiOrbit
            cols={56}
            rows={6}
            seed={SEED + 7}
            className="absolute -top-7 right-0 hidden opacity-70 lg:block [mask-image:linear-gradient(to_right,transparent,black_30%,black_85%,transparent)]"
          />
        </div>
        <div className="relative mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel chrome="terminal" label="POST /v1/enrich" copyText={REQUEST}>
            <AnimatedCode code={REQUEST} mode="static" className="text-foreground" />
          </CodePanel>
          <CodePanel chrome="terminal" label="response">
            <AnimatedCode code={RESPONSE} mode="scramble" resolveMs={2200} playOnView className="text-foreground" />
          </CodePanel>
        </div>
      </section>
    </div>
  );
}
