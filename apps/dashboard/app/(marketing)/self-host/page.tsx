import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Terminal } from 'lucide-react';
import { PillButton } from '@/components/shared/pill-button';
import { CodePanel, CodeBlock } from '@/components/shared/code-panel';
import { HeroField } from '@/components/marketing/hero-field';
import { ScrollStrip } from '@/components/marketing/scroll-strip';
import { AsciiFluid } from '@/components/shared/ascii-fluid';

export const metadata: Metadata = {
  title: 'Self-host',
  description: 'Run every Helix capability yourself. Health-gated docker compose up, bring your own provider keys, nothing withheld.',
};

const COMPOSE_UP = `$ cp .env.example .env
$ docker compose up

◇  postgres        starting
◆  postgres        healthy        1.2s
◆  fetch           healthy        0.8s
◆  extract         healthy        2.1s
◆  api             healthy        0.6s
   dashboard  → http://localhost:3400
   api        → http://localhost:7400/v1`;

const CURL_EXAMPLE = `$ curl -X POST localhost:7400/v1/scrape \\
    -H "Authorization: Bearer $HELIX_BOOTSTRAP_KEY" \\
    -H "Content-Type: application/json" \\
    -d '{"url":"https://example.com"}'

{ "success": true, "data": { "markdown": "# Example Domain..." } }`;

const ENV_CORE = `HELIX_PORT=7400
HELIX_BOOTSTRAP_KEY=            # openssl rand -hex 32
DATABASE_URL=postgres://helix:helix@localhost:7432/helix
HELIX_FETCH_URL=http://localhost:7401
HELIX_EXTRACT_URL=http://localhost:7402`;

const ENV_LLM = `HELIX_LLM_PROVIDER=openai
HELIX_LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# OpenAI-compatible path — OpenRouter, Ollama, vLLM, LM Studio
OPENAI_COMPATIBLE_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=`;

const ENV_OTHER = `# proxies — bring your own, blank fetches direct
HELIX_PROXY_URL=

# search — a self-hosted SearXNG needs no key; Serper and SerpAPI are BYOK
HELIX_SEARCH_PROVIDER=auto
SEARXNG_URL=
SERPER_API_KEY=
SERPAPI_KEY=

# embeddings default to a local model — no keys required
HELIX_EMBEDDING_PROVIDER=local
HELIX_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2`;

const COMPARISON = [
  { row: 'Anti-bot / stealth tier', helix: 'included', norm: 'cloud-only' },
  { row: 'Screenshots, actions, documents', helix: 'included', norm: 'partial' },
  { row: 'LLM extraction', helix: 'your key, your provider, no margin', norm: 'vendor credits' },
  { row: 'Licence', helix: 'Apache-2.0', norm: 'AGPL' },
  { row: 'Cost visibility', helix: '`estimate: true` before any crawl', norm: 'none' },
] as const;

export default function SelfHostPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="wave" seed={31} />
        <section className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Run it yourself. <span className="block text-violet">All of it.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
            The self-host build is the product. There is no cloud-only tier, no held-back stealth layer, no licence
            that stops you embedding it.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="/docs/getting-started" variant="primary">
              Developer quickstart <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
            <PillButton href="/architecture" variant="secondary">
              Read the architecture
            </PillButton>
          </div>
        </section>
      </div>

      <section className="mx-auto mt-16 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 rounded-panel shadow-cutout" aria-hidden />
          <CodePanel chrome="terminal" label="terminal" copyText={COMPOSE_UP}>
            <CodeBlock dark>{COMPOSE_UP}</CodeBlock>
          </CodePanel>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-m-ink/72">
          Every service waits for its dependencies to report healthy before it starts. There is no boot race to
          retry past, and a modest idle footprint on a laptop or a small VM.
        </p>
        <div className="relative mt-6">
          <CodePanel chrome="terminal" label="verify" copyText={CURL_EXAMPLE}>
            <CodeBlock dark>{CURL_EXAMPLE}</CodeBlock>
          </CodePanel>
        </div>
      </section>

      <ScrollStrip seed={31} direction="right" className="mt-16" />

      <section className="mx-auto mt-16 max-w-[880px] animate-fade-up">
        <h2 id="security" className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">
          Your keys, your bill, your providers.
        </h2>
        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-m-ink/72">
          Helix calls your models with your keys. Your provider bills you directly, and nothing here is ever sent
          to a Helix-operated service.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <CodePanel chrome="terminal" label=".env — core">
            <CodeBlock dark>{ENV_CORE}</CodeBlock>
          </CodePanel>
          <CodePanel chrome="terminal" label=".env — LLM (BYOK)">
            <CodeBlock dark>{ENV_LLM}</CodeBlock>
          </CodePanel>
        </div>
        <div className="mt-5">
          <CodePanel chrome="terminal" label=".env — search, proxy, embeddings">
            <CodeBlock dark>{ENV_OTHER}</CodeBlock>
          </CodePanel>
        </div>
      </section>

      <ScrollStrip seed={37} direction="left" className="mt-16" />

      <section className="mx-auto mt-16 max-w-[880px] animate-fade-up">
        <h2 className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">
          No cloud-only tier.
        </h2>
        <div className="mt-6 overflow-x-auto rounded-card border border-m-border-muted bg-m-surface shadow-card-sm">
          <table className="w-full min-w-[520px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-m-border-faint text-left text-m-ink/56">
                <th className="px-5 py-3 font-normal" />
                <th className="px-5 py-3 font-normal">Helix self-host</th>
                <th className="px-5 py-3 font-normal">Category norm</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((item) => (
                <tr key={item.row} className="border-b border-m-border-faint last:border-0">
                  <td className="px-5 py-3 text-m-ink/72">{item.row}</td>
                  <td className="px-5 py-3 text-m-ink">{item.helix}</td>
                  <td className="px-5 py-3 text-m-ink/56">{item.norm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="relative mt-12">
        <AsciiFluid
          cols={44}
          rows={14}
          seed={5}
          className="absolute bottom-0 left-[3%] hidden lg:block [mask-image:linear-gradient(to_right,black_60%,transparent)]"
        />
        <AsciiFluid
          cols={44}
          rows={14}
          seed={9}
          className="absolute bottom-0 right-[3%] hidden lg:block [mask-image:linear-gradient(to_left,black_60%,transparent)]"
        />
        <div className="relative mx-auto max-w-[720px] py-10 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PillButton href="/download" variant="primary">
              Get the app <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
            <PillButton href="/docs/getting-started" variant="secondary">
              <Terminal className="h-3.5 w-3.5" aria-hidden /> Developer quickstart
            </PillButton>
          </div>
          <p className="mt-8 text-[14px] text-m-ink/56">
            Deploying at scale? Read the{' '}
            <Link href="/architecture" className="text-violet underline decoration-violet-40 underline-offset-4 hover:decoration-violet">
              architecture
            </Link>{' '}
            for the three-runtime shape and the fetch ladder.
          </p>
        </div>
      </section>
    </div>
  );
}
