import { Bot, Search, Sparkles, UserPlus } from 'lucide-react';
import { SectionEyebrow } from './section-eyebrow';

const CARDS = [
  { icon: Search, title: 'Deep research', body: 'Search, read every result, follow the citations. One call per hop.' },
  { icon: Sparkles, title: 'Smarter AI chats', body: 'Fresh page content in the context window instead of a stale index.' },
  { icon: Bot, title: 'AI agent tools', body: 'Six endpoints as MCP tools, one command to connect.' },
  { icon: UserPlus, title: 'Onboarding', body: "Read a customer's site to pre-fill their workspace." },
];

/** WEBSITE.md §4.7: 4 cards. */
export function UseCases() {
  return (
    <section className="border-t border-m-border-faint px-4 py-20">
      <div className="mx-auto max-w-container">
        <SectionEyebrow step="05 / 05" label="USE CASES" sub="What people build" />
        <h2 className="mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Give your agents the live web.
        </h2>

        <div className="mt-10 flex gap-5 overflow-x-auto sm:grid sm:grid-cols-4 sm:overflow-visible">
          {CARDS.map((c, i) => (
            <div
              key={c.title}
              style={{ animationDelay: `${i * 60}ms` }}
              className="w-[240px] shrink-0 animate-fade-up rounded-card border border-m-border-muted bg-m-surface p-5 shadow-card-sm sm:w-auto"
            >
              <c.icon className="h-5 w-5 text-violet" aria-hidden />
              <h3 className="mt-3 text-[18px] font-medium leading-tight tracking-tight">{c.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-m-ink/64">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
