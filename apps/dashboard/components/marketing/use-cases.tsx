import { Bot, Search, SquareStack, UserPlus } from 'lucide-react';
import { SectionEyebrow } from './section-eyebrow';

const CARDS = [
  { icon: Search, title: 'Deep research', body: 'Search, read every result, follow the citations. One call per hop instead of a search API plus a scraper stitched together by hand.' },
  { icon: SquareStack, title: 'Fresh context for chats', body: 'Pull the current page into the context window instead of relying on a stale index or a cached snapshot.' },
  { icon: Bot, title: 'Tools for agents', body: 'Six endpoints exposed as MCP tools. One command connects Claude Code, Cursor, Codex or Windsurf.' },
  { icon: UserPlus, title: 'Onboarding from a URL', body: "Read a customer's own site during signup and pre-fill their workspace from it." },
];

/** WEBSITE.md §4.7: 4 cards. */
export function UseCases() {
  return (
    <section className="border-t border-m-border-faint px-4 py-20">
      <div className="mx-auto max-w-container">
        <div data-reveal>
          <SectionEyebrow step="04 / 04" label="USE CASES" sub="What people build" />
          <h2 className="mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
            Give your agents the live web.
          </h2>
        </div>

        <div data-reveal-group className="mt-10 grid w-full min-w-0 max-w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => (
            <div
              key={c.title}
              data-reveal-item
              className="min-w-0 rounded-card border border-m-border-muted bg-m-surface p-5 shadow-card-sm transition-colors duration-200 ease-out hover:bg-m-ink/[0.031]"
            >
              <c.icon className="h-5 w-5 text-violet" strokeWidth={1.75} aria-hidden />
              <h3 className="mt-3 text-[18px] font-medium leading-tight tracking-tight">{c.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-m-ink/64">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
