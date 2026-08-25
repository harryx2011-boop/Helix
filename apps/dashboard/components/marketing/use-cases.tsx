'use client';

import * as React from 'react';
import { Bot, Search, SquareStack, UserPlus } from 'lucide-react';
import { SectionEyebrow } from './section-eyebrow';
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
    icon: SquareStack,
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
    icon: Bot,
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
    <section className="border-t border-m-border-faint px-4 py-20">
      <div className="mx-auto max-w-container">
        <div data-reveal className="text-center">
          <SectionEyebrow step="04 / 04" label="USE CASES" sub="What people build" />
          <h2 className="mx-auto mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
            Give your agents
            <br />
            <span className="text-violet">the live web.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
            Four ways teams point an agent at the open web today.
          </p>
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
                  <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-violet" strokeWidth={1.75} aria-hidden />
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
