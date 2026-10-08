'use client';

import * as React from 'react';
import { Bell, Bot, Search, Table2 } from '@/components/icons/lucide';
import { FrameBand } from './section-frame';
import { AsciiNoise } from '@/components/shared/ascii-fields';
import { IconTile } from './icon-tile';
import { CodePanel } from '@/components/shared/code-panel';
import { AnimatedCode } from '@/components/shared/animated-code';

interface UseCase {
  icon: typeof Search;
  title: string;
  body: string;
  label: string;
  sample: string;
}

const CASES: UseCase[] = [
  {
    icon: Search,
    title: 'Research a topic',
    body: 'Search, read every result and keep the text of each page, with its link.',
    label: 'Example: research',
    sample: `You ask:   seed round valuations 2026

Helix:    found 5 pages
          read all 5
          kept the text of each, with its link`,
  },
  {
    icon: Bell,
    title: 'Keep an eye on a page',
    body: 'Get told when a price, a policy or a listing changes.',
    label: 'Example: watching a page',
    sample: `Watching: example.com/pricing, once a day

Today:    Standard went from $29 to $34 a month
          nothing else changed`,
  },
  {
    icon: Table2,
    title: 'Build a table from a site',
    body: 'Pull names, prices or dates from many pages into one table.',
    label: 'Example: a table',
    sample: `You ask:   every plan with its name and monthly price

Helix:    read 12 pages
          filled one table, 31 rows
          left 2 values blank, not on the page`,
  },
  {
    icon: Bot,
    title: 'Help your AI assistant',
    body: 'Connect Helix to the AI tools you already use so they can read live pages.',
    label: 'Example: an AI tool',
    sample: `You ask your AI tool:
  "What does their pricing page say today?"

The tool asks Helix to open the page.
Helix returns the text.
The tool answers from it.`,
  },
];

/** Home §4: selectable use-case list driving a plain-words example panel. */
export function UseCases() {
  const [active, setActive] = React.useState(0);
  const current = CASES[active]!;

  return (
    <section className="relative overflow-hidden px-6 py-16 sm:px-10">
      <FrameBand step="04" icon={Bot} />

      <div className="relative py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <AsciiNoise
            cols={120}
            rows={18}
            seed={131}
            className="absolute -inset-x-24 -inset-y-10 hidden overflow-hidden opacity-80 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_40%,black_68%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              What people use it for<span className="text-violet">.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
              Four everyday jobs. Pick one to see what it looks like.
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
              <AnimatedCode key={active} code={current.sample} mode="reveal" lineMs={45} playOnView className="text-foreground" />
            </CodePanel>
          </div>
        </div>
      </div>
    </section>
  );
}
