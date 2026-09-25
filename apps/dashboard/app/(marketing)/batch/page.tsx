import type { Metadata } from 'next';
import { ArrowRight, Layers, ListChecks, Webhook, Gauge } from 'lucide-react';
import { PillButton } from '@/components/shared/pill-button';
import { CodePanel } from '@/components/shared/code-panel';
import { AnimatedCode } from '@/components/shared/animated-code';
import { BentoCard, EvidenceChip } from '@/components/marketing/bento';
import { MeterPanel } from '@/components/marketing/meter';
import { HeroField } from '@/components/marketing/hero-field';
import { ScrollStrip } from '@/components/marketing/scroll-strip';
import { AsciiFlow } from '@/components/shared/ascii-fields';

export const metadata: Metadata = {
  title: 'Batch Scrape API',
  description: 'Up to 10,000 URLs in, one job to poll. Runs /scrape on the crawl worker: per-host politeness, robots.txt, and a result per URL.',
};

/* Request and response mirror POST /batch/scrape and GET /batch/scrape/{jobId} in openapi.yaml. */
const REQUEST = `POST /v1/batch/scrape
{
  "urls": [
    "https://example.com/a",
    "https://example.com/b",
    "https://other.example/c",
    "not a url"
  ],
  "ignoreInvalidURLs": true,
  "scrapeOptions": { "formats": ["markdown", "links"], "onlyMainContent": true },
  "maxConcurrency": 4,
  "webhook": "https://caller.example/hooks/batch"
}

# then poll, or wait for the webhook
GET /v1/batch/scrape/0d9f7c1e-1a3c-4d21-9f0e-5b6a2c8d4e11`;

const RESPONSE = `HTTP 202
{
  "success": true,
  "id": "0d9f7c1e-1a3c-4d21-9f0e-5b6a2c8d4e11",
  "jobId": "0d9f7c1e-1a3c-4d21-9f0e-5b6a2c8d4e11",
  "total": 3,
  "invalidURLs": ["not a url"],
  "url": "/v1/batch/scrape/0d9f7c1e-1a3c-4d21-9f0e-5b6a2c8d4e11"
}

# GET /v1/batch/scrape/{jobId}
{
  "id": "0d9f7c1e-…",
  "jobId": "0d9f7c1e-…",
  "type": "batch_scrape",
  "status": "completed",
  "total": 3,
  "completed": 3,
  "failed": 0,
  "data": [
    {
      "url": "https://example.com/a",
      "markdown": "# A\\n…",
      "links": ["https://example.com/b"],
      "metadata": { "sourceUrl": "https://example.com/a", "finalUrl": "https://example.com/a", "statusCode": 200 }
    }
  ],
  "usage": { "pagesFetched": 3, "pagesFromCache": 0 },
  "expiresAt": "2026-09-10T10:12:04.118Z"
}`;

const MOCK = `$ curl -X POST localhost:7400/v1/batch/scrape \\
    -H 'Authorization: Bearer helix-...' \\
    -d '{"urls":["https://example.com/a","https://example.com/b","https://other.example/c"]}'

HTTP 202
{ "success": true, "jobId": "0d9f7c1e-…", "total": 3, "url": "/v1/batch/scrape/0d9f7c1e-…" }

$ curl localhost:7400/v1/batch/scrape/0d9f7c1e-…
{ "status": "completed", "total": 3, "completed": 3, "failed": 0, "data": [ … ] }`;

const FEATURES = [
  { icon: Layers, lead: 'A crawl whose frontier you wrote.', body: 'Nothing is followed and no sitemap is read. The list may span hosts; duplicates are dropped before the job exists.', evidence: 'maxDepth: 0 · allowExternal: true' },
  { icon: ListChecks, lead: 'One bad URL does not fail the batch.', body: 'Each item carries its own result; the job reports completed and failed counts alongside them.', evidence: 'outcomes · sample batch', meters: [
    { label: 'completed', value: 96, accent: true },
    { label: 'failed', value: 4 },
  ] },
  { icon: Webhook, lead: 'A job id in the 202, events if you want them.', body: 'Set webhook to receive started, page, completed and failed instead of polling. DELETE cancels and keeps finished results.', evidence: '"url": "/v1/batch/scrape/{jobId}"' },
  { icon: Gauge, lead: 'Per-host politeness and robots.txt apply.', body: 'maxConcurrency caps each host, delay spaces requests, and adaptive politeness backs off on 429s. Same worker, same rules.', evidence: 'per-host concurrency · sample batch', meterSize: 'thin' as const, meters: [
    { label: 'example.com', value: 75, display: '3 / 4' },
    { label: 'other.example', value: 25, display: '1 / 4' },
    { label: 'backed off', value: 0, display: '0' },
  ] },
];

const SPAN: ('wide' | 'narrow')[] = ['wide', 'narrow', 'narrow', 'wide'];
const SEED = 'batch'.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);

export default function BatchPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="cloud" seed={SEED} />
        <section className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="mt-2 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            <span className="block">Ten thousand URLs in,</span>
            <span className="block text-violet">one job to poll.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
            /scrape run on the crawl worker. Per-host politeness and robots.txt apply, every URL gets its own outcome, and nothing is followed.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="/download" variant="primary">
              Get the app <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
            <PillButton href="/docs/api-reference" variant="secondary">
              Read the docs
            </PillButton>
          </div>
        </section>
      </div>

      <section className="relative mx-auto mt-14 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <div className="pointer-events-none absolute inset-0 rounded-panel shadow-cutout" aria-hidden />
        <CodePanel chrome="terminal" label="$ helix batch">
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
          <AsciiFlow
            cols={56}
            rows={6}
            seed={SEED + 7}
            className="absolute -top-7 right-0 hidden opacity-70 lg:block [mask-image:linear-gradient(to_right,transparent,black_30%,black_85%,transparent)]"
          />
        </div>
        <div className="relative mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel chrome="terminal" label="POST /v1/batch/scrape" copyText={REQUEST}>
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
