import { Gauge, ShieldCheck, Timer } from 'lucide-react';
import { SectionEyebrow } from './section-eyebrow';

const CARDS = [
  {
    icon: ShieldCheck,
    title: 'Health-gated startup',
    body: 'Services wait for their dependencies; nothing to retry past.',
  },
  {
    icon: Gauge,
    title: 'Fail-open rate limiting',
    body: "If the limiter's store is unreachable, your request proceeds and the log says so. X-RateLimit-* on every response.",
  },
  {
    icon: Timer,
    title: 'Estimate before you run',
    body: 'Any operation that scales with discovered pages accepts estimate: true. Projected, not surprised.',
  },
];

/** WEBSITE.md §4.6: 3 cards. Carries the second "X, not Y" line. */
export function ObjectionB() {
  return (
    <section className="border-t border-m-border-faint px-4 py-20">
      <div className="mx-auto max-w-container">
        <SectionEyebrow step="04 / 05" label="OPERATIONS" sub="First boot" />
        <h2 className="mt-4 max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
          Up in one command. Stays up.
        </h2>
        <p className="mt-3 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
          Health-gated startup, no boot race, a modest idle footprint, and a dashboard that tells you what every
          request cost and why.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {CARDS.map((c, i) => (
            <div
              key={c.title}
              style={{ animationDelay: `${i * 60}ms` }}
              className="animate-fade-up rounded-card border border-m-border-muted bg-m-surface p-5 shadow-card-sm"
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
