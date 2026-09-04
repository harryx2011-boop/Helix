'use client';

import * as React from 'react';
import { Bot, RefreshCw, Search, UserPlus, Wrench } from 'lucide-react';
import { FrameBand } from './section-frame';
import { AmbientCode, CodeRain } from './ambient';
import { IconTile } from './icon-tile';
import { CodePanel } from './code-panel';
import { AnimatedCode, type Token } from './animated-code';

interface UseCase {
  icon: typeof Search;
  title: string;
  body: string;
  label: string;
  code: Token[][];
}

const K = (text: string): Token => ({ kind: 'key', text });
const S = (text: string): Token => ({ kind: 'string', text });
const P = (text: string): Token => ({ kind: 'punct', text });
const PL = (text: string): Token => ({ kind: 'plain', text });

const CASES: UseCase[] = [
  {
    icon: Search,
    title: 'Deep research',
    body: 'Search, read every result, follow the citations in one call.',
    label: 'research.sh',
    code: [
      [K('POST'), PL(' '), S('/v1/search')],
      [P('{')],
      [PL('  '), K('"query"'), P(':'), PL(' '), S('"series a seed valuations 2026"'), P(',')],
      [PL('  '), K('"limit"'), P(':'), PL(' '), PL('5'), P(',')],
      [PL('  '), K('"scrapeOptions"'), P(':'), PL(' '), P('{'), K('"formats"'), P(':'), PL(' '), P('['), S('"markdown"'), P(']'), PL(' '), P('}')],
      [P('}')],
      [],
      [PL('5 results · 5 pages read · 41 KB markdown')],
    ],
  },
  {
    icon: RefreshCw,
    title: 'Fresh context for chats',
    body: 'Pull the live page into context instead of a stale cached index.',
    label: 'scrape.sh',
    code: [
      [K('POST'), PL(' '), S('/v1/scrape')],
      [P('{')],
      [PL('  '), K('"url"'), P(':'), PL(' '), S('"https://example.com/pricing"'), P(',')],
      [PL('  '), K('"formats"'), P(':'), PL(' '), P('['), S('"markdown"'), P(']')],
      [P('}')],
      [],
      [K('"tier"'), P(':'), PL(' '), S('"plain"'), PL('  ·  200  ·  312ms')],
    ],
  },
  {
    icon: Wrench,
    title: 'Tools for agents',
    body: 'Six endpoints as MCP tools. One command wires up the agent.',
    label: 'init.sh',
    code: [
      [PL('$ '), K('npx'), PL(' -y @helix/cli@latest init --all')],
      [],
      [PL('✓ claude-code  '), PL('mcp + SKILL.md')],
      [PL('✓ cursor       '), PL('mcp')],
      [PL('✓ windsurf     '), PL('mcp')],
    ],
  },
  {
    icon: UserPlus,
    title: 'Onboarding from a URL',
    body: "Read a customer's site during signup, pre-fill their workspace.",
    label: 'onboard.sh',
    code: [
      [K('POST'), PL(' '), S('/v1/scrape')],
      [P('{')],
      [PL('  '), K('"url"'), P(':'), PL(' '), S('"https://acme.com"'), P(',')],
      [PL('  '), K('"jsonOptions"'), P(':'), PL(' '), P('{'), K('"schema"'), P(':'), PL(' '), PL('companySchema'), PL(' '), P('}')],
      [P('}')],
      [],
      [P('{')],
      [PL('  '), K('"company"'), P(':'), PL(' '), S('"Acme"'), P(',')],
      [PL('  '), K('"products"'), P(':'), PL(' '), P('['), PL('...'), P(']')],
      [P('}')],
    ],
  },
];

/** WEBSITE.md §4.7: selectable use-case list driving a live demo panel. */
export function UseCases() {
  const [active, setActive] = React.useState(0);
  const current = CASES[active]!;

  return (
    <section className="relative overflow-hidden px-6 py-16 sm:px-10">
      <AmbientCode count={6} seed={37} className="bottom-auto left-0 right-auto top-40 hidden h-[280px] w-[17%] opacity-60 lg:block [mask-image:linear-gradient(to_right,black_60%,transparent)]" />
      <AmbientCode count={6} seed={38} className="bottom-auto left-auto right-0 top-40 hidden h-[280px] w-[17%] opacity-60 lg:block [mask-image:linear-gradient(to_left,black_60%,transparent)]" />
      <FrameBand step="06" total="07" label="USE CASES" sub="What people build" icon={Bot} />

      <div className="relative py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <CodeRain
            cols={22}
            rows={6}
            density={0.4}
            seed={131}
            className="hidden -inset-y-10 -inset-x-24 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_46%,black_66%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Give your agents
              <br />
              <span className="text-violet">the live web.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
              Four ways teams point an agent at the open web today.
            </p>
          </div>
        </div>

        <div data-reveal className="mt-10 grid w-full min-w-0 max-w-full grid-cols-1 gap-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-1">
            {CASES.map((c, i) => {
              const isActive = i === active;
              return (
                <button
                  key={c.title}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActive(i)}
                  className={
                    'flex min-w-0 items-start gap-3 rounded-card border-l-2 px-4 py-3.5 text-left transition-colors duration-fast ease-out ' +
                    (isActive ? 'border-violet bg-violet-4' : 'border-transparent hover:bg-m-ink/[0.031]')
                  }
                >
                  <IconTile icon={c.icon} />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium leading-tight tracking-tight">{c.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-m-ink/64">{c.body}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="min-w-0">
            <CodePanel chrome="terminal" label={current.label}>
              <AnimatedCode key={active} code={current.code} mode="reveal" lineMs={45} playOnView />
            </CodePanel>
          </div>
        </div>
      </div>
    </section>
  );
}
