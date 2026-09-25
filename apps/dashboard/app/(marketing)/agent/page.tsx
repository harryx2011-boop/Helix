import type { Metadata } from 'next';
import { ArrowRight, Braces, RefreshCw, Link, KeyRound } from 'lucide-react';
import { PillButton } from '@/components/shared/pill-button';
import { CodePanel } from '@/components/shared/code-panel';
import { AnimatedCode } from '@/components/shared/animated-code';
import { BentoCard, EvidenceChip } from '@/components/marketing/bento';
import { MeterPanel } from '@/components/marketing/meter';
import { HeroField } from '@/components/marketing/hero-field';
import { ScrollStrip } from '@/components/marketing/scroll-strip';
import { AsciiFlow } from '@/components/shared/ascii-fields';

export const metadata: Metadata = {
  title: 'Agent Schema API',
  description: 'Describe the data you want in a sentence and get a JSON Schema back, ready for jsonOptions.schema on /scrape and /parse or scrapeOptions.schema on /search.',
};

/* Request and response mirror POST /agent/schema in openapi.yaml. */
const REQUEST = `POST /v1/agent/schema
{
  "prompt": "Every pricing plan on the page, with its name, monthly price and included features.",
  "urls": ["https://example.com/pricing"]
}

# refine a previous schema instead of starting over
{
  "prompt": "Every pricing plan on the page",
  "hint": { "type": "object", "properties": { "plans": { "type": "array", "items": { … } } } },
  "instruction": "Also capture whether each plan is marked \\"Most popular\\"."
}`;

const RESPONSE = `{
  "success": true,
  "schema": {
    "type": "object",
    "properties": {
      "plans": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "monthlyPrice": { "type": "number" },
            "features": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["name", "monthlyPrice"]
        }
      }
    },
    "required": ["plans"]
  },
  "summary": "Pricing plans with name, monthly price and included features.",
  "usage": { "tokens": { "input": 412, "output": 96 }, "model": "…" }
}

# model not configured, unreachable or timed out
{ "success": false, "failure": { "reason": "service_unavailable", "detail": "…" } }`;

const MOCK = `> Every pricing plan on the page, with its name,
  monthly price and included features.

{
  "type": "object",
  "properties": {
    "plans": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name":         { "type": "string" },
          "monthlyPrice": { "type": "number" },
          "features":     { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}

→ paste into jsonOptions.schema on /scrape`;

const FEATURES = [
  { icon: Braces, lead: 'A sentence in, a JSON Schema out.', body: 'The result drops straight into jsonOptions.schema on /scrape or /parse, or scrapeOptions.schema on /search.', evidence: 'outcomes · sample instance', meters: [
    { label: 'schema returned', value: 92, accent: true },
    { label: 'service_unavailable', value: 6 },
    { label: 'timeout', value: 2 },
  ] },
  { icon: RefreshCw, lead: 'Send the last schema back with a change.', body: 'hint carries the previous schema; instruction says what to add or drop. The rest stays as it was.', evidence: '"hint": { … } · "instruction": "Also capture …"' },
  { icon: Link, lead: 'Example URLs shape the fields.', body: 'Up to ten urls tell the model what the schema will run against. None of them is fetched by this call.', evidence: '"urls": [ … ] · not fetched' },
  { icon: KeyRound, lead: 'Runs on the provider key you stored.', body: 'Anthropic, OpenAI, OpenRouter, Google, Ollama, vLLM or an OpenAI-compatible endpoint. Naming one is how a local runtime is reached.', evidence: 'tokens per design · sample instance', meterSize: 'thin' as const, meters: [
    { label: 'input', value: 81, accent: true, display: '412' },
    { label: 'output', value: 19, display: '96' },
  ] },
];

const SPAN: ('wide' | 'narrow')[] = ['wide', 'narrow', 'narrow', 'wide'];
const SEED = 'agent'.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);

export default function AgentPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="orbit" seed={SEED} />
        <section className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="mt-2 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            <span className="block">Say what you want,</span>
            <span className="block text-violet">get the schema.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
            One sentence becomes a JSON Schema for /scrape, /parse or /search. Refine it by sending it back with an instruction. Designed on the model you configured.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="/app/agent" variant="primary">
              Open the Agent <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
            <PillButton href="/docs/api-reference" variant="secondary">
              Read the docs
            </PillButton>
          </div>
        </section>
      </div>

      <section className="relative mx-auto mt-14 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <div className="pointer-events-none absolute inset-0 rounded-panel shadow-cutout" aria-hidden />
        <CodePanel chrome="browser" label="app/agent">
          <AnimatedCode code={MOCK} mode="type" charMs={14} lineMs={55} playOnView />
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
          <AsciiFlow
            cols={56}
            rows={6}
            seed={SEED + 7}
            className="absolute -top-7 right-0 hidden opacity-70 lg:block [mask-image:linear-gradient(to_right,transparent,black_30%,black_85%,transparent)]"
          />
        </div>
        <div className="relative mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel chrome="terminal" label="POST /v1/agent/schema" copyText={REQUEST}>
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
