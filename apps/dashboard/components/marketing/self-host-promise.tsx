import { Check } from 'lucide-react';
import { SectionEyebrow } from './section-eyebrow';
import { PillButton } from './pill-button';
import { CodePanel, CodeToken } from './code-panel';
import { TerminalReplay } from './terminal-replay';

const COMPOSE_LINES: { text: string; callout?: string }[] = [
  { text: 'services:' },
  { text: '  postgres:', callout: 'state · runs, keys, jobs' },
  { text: '    image: postgres:16' },
  { text: '  helix-fetch:', callout: 'TLS identity · proxy egress' },
  { text: '    build: ./services/fetch' },
  { text: '  helix-extract:', callout: 'parsing · LLM · embeddings' },
  { text: '    build: ./services/extract' },
  { text: '  helix-api:', callout: 'routes · auth · rate limits' },
  { text: '    build: ./apps/api' },
  { text: '  dashboard:', callout: 'this app, static export' },
  { text: '    build: ./apps/dashboard' },
];

const ARCHITECTURE_DIAGRAM = `┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  dashboard   │────▶│  helix-api   │────▶│ helix-fetch  │
│  (Next.js)   │     │  (Fastify)   │     │  (Playwright)│
└──────────────┘     └──────┬───────┘     └──────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │helix-extract │
                      │ (parse · LLM)│
                      └──────┬───────┘
                             │
                             ▼
                      ┌──────────────┐
                      │  postgres    │
                      └──────────────┘`;

const ROWS: { label: string; helix: string; norm: string }[] = [
  { label: 'Anti-bot / stealth tier', helix: 'included', norm: 'cloud-only' },
  { label: 'Screenshots, actions, documents', helix: 'included', norm: 'partial' },
  { label: 'LLM extraction', helix: 'your key, your provider, no margin', norm: 'vendor credits' },
  { label: 'Licence', helix: 'Apache-2.0', norm: 'AGPL' },
  { label: 'Cost visibility', helix: 'estimate: true before any crawl', norm: 'none' },
];

/** WEBSITE.md §4.5: the centerpiece section. Terminal replay, compose file + architecture diagram, comparison table. */
export function SelfHostPromise() {
  return (
    <section className="border-t border-m-border-faint bg-m-bg-lighter px-4 py-24">
      <div className="mx-auto max-w-container">
        <SectionEyebrow step="03 / 05" label="SELF-HOST" sub="The whole product" />
        <h2 className="mt-4 max-w-[600px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Run it yourself. All of it.
        </h2>
        <p className="mt-3 max-w-[600px] text-[16px] leading-relaxed text-m-ink/72">
          The self-host build is the product. There is no cloud-only tier, no held-back stealth layer, no licence
          that stops you embedding it.
        </p>

        <div className="mt-12">
          <TerminalReplay />
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <CodePanel chrome="browser" label="docker-compose.yml">
            <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed">
              {COMPOSE_LINES.map((line, i) => (
                <div key={i} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <CodeToken kind={line.text.trim().endsWith(':') && !line.text.includes('  ') ? 'key' : 'plain'}>
                    {line.text}
                  </CodeToken>
                  {line.callout && (
                    <span className="shrink-0 font-mono text-[11px] text-m-ink/40">{'// '}{line.callout}</span>
                  )}
                </div>
              ))}
            </pre>
          </CodePanel>

          <div className="min-w-0 max-w-full rounded-panel border border-m-border-muted bg-m-surface p-5 shadow-card-sm">
            <p className="font-mono text-[12px] uppercase tracking-wide text-m-ink/48">Three runtimes</p>
            <div className="w-full min-w-0 max-w-full overflow-hidden">
              <pre className="mt-3 whitespace-pre font-mono text-[8.5px] leading-relaxed tracking-tighter text-m-ink/64 sm:text-[12px] sm:tracking-normal">
                {ARCHITECTURE_DIAGRAM}
              </pre>
            </div>
          </div>
        </div>

        <div className="mt-8 min-w-0 max-w-full rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[520px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-m-border-faint text-left font-mono text-[12px] uppercase tracking-wide text-m-ink/48">
                  <th className="px-5 py-3 font-normal"> </th>
                  <th className="px-5 py-3 font-normal">Helix self-host</th>
                  <th className="px-5 py-3 font-normal">Category norm</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-m-border-faint last:border-0">
                    <td className="px-5 py-3 text-m-ink/72">{row.label}</td>
                    <td className="px-5 py-3 font-medium text-m-ink">
                      <span className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 shrink-0 text-violet" aria-hidden />
                        {row.helix}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-m-ink/48">{row.norm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-m-border-faint sm:hidden">
            {ROWS.map((row) => (
              <div key={row.label} className="min-w-0 px-4 py-3">
                <p className="text-[12px] text-m-ink/56">{row.label}</p>
                <p className="mt-1 flex items-center gap-1.5 break-words text-[13px] font-medium text-m-ink">
                  <Check className="h-3.5 w-3.5 shrink-0 text-violet" aria-hidden />
                  {row.helix}
                </p>
                <p className="mt-0.5 text-[12px] text-m-ink/40">Category norm: {row.norm}</p>
              </div>
            ))}
          </div>
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
