'use client';

import * as React from 'react';
import Link from 'next/link';
import { ENDPOINTS, PRODUCTS } from '@/lib/catalog';
import { generateCode, LANGS, type Lang } from '@/lib/codegen';
import { SectionEyebrow } from './section-eyebrow';
import { CodePanel, CodeToken } from './code-panel';

const THREE_UP = PRODUCTS.filter((p) => ['scrape', 'crawl', 'search'].includes(p.id));
const ROW = ENDPOINTS.filter((e) => ['parse', 'interact', 'monitor'].includes(e.id));

/** WEBSITE.md §4.3: 3-up cards, coming row, browser-chrome code sample. */
export function Capabilities() {
  const [lang, setLang] = React.useState<Lang>('python');
  const code = generateCode(lang, { endpoint: 'scrape', body: { url: 'https://example.com', formats: ['markdown'] } });

  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-container">
        <SectionEyebrow step="01 / 05" label="CAPABILITIES" sub="Six endpoints" />
        <h2 className="mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Read, search, and act on the web.
        </h2>
        <p className="mt-3 max-w-[520px] text-[16px] leading-relaxed text-m-ink/72">
          One envelope for every endpoint. Web pages and documents come back the same shape.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {THREE_UP.map((p, i) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.id}
                href={p.route}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group animate-fade-up rounded-card border border-m-border-muted bg-m-surface p-5 shadow-card-sm transition-colors duration-200 ease-out hover:bg-m-ink/[0.031]"
              >
                <Icon className="h-5 w-5 text-violet" aria-hidden />
                <h3 className="mt-3 text-[20px] font-medium leading-tight tracking-tight">{p.name}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-m-ink/64">{p.tagline}</p>
                <span className="mt-3 block h-[1.2em] text-[13px] font-medium text-violet opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100">
                  Learn more →
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-5 grid divide-y divide-m-border-faint overflow-hidden rounded-panel border border-m-border-muted bg-m-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {ROW.map((e) => {
            const Icon = e.icon;
            return (
              <div key={e.id} className="p-5">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-m-ink/56" aria-hidden />
                  <h3 className="text-[16px] font-medium">{e.name}</h3>
                  <span className="rounded-pill bg-violet-12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-violet">
                    coming
                  </span>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-m-ink/64">{e.tagline}</p>
              </div>
            );
          })}
        </div>

        <CodePanel
          chrome="browser"
          label="api.helix.dev"
          className="mt-8"
          copyText={code}
          tabs={LANGS.filter((l) => l.id !== 'mcp').map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              className={`rounded-pill px-2.5 py-1 font-mono text-[12px] transition-colors duration-150 ease-out ${
                lang === l.id ? 'bg-m-bg text-m-ink' : 'text-m-ink/48 hover:text-m-ink/72'
              }`}
            >
              {l.label}
            </button>
          ))}
        >
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed sm:whitespace-pre sm:break-normal">
            <CodeToken kind="plain">{code}</CodeToken>
          </pre>
        </CodePanel>
      </div>
    </section>
  );
}
