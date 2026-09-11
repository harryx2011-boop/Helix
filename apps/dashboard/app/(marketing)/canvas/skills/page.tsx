import type { Metadata } from 'next';
import {
  Accessibility,
  CalendarDays,
  ClipboardCheck,
  ListChecks,
  MessagesSquare,
  Sunrise,
  TrendingUp,
  Users,
} from 'lucide-react';
import { IconTile } from '@/components/marketing/icon-tile';
import { PillButton } from '@/components/marketing/pill-button';
import type { GlyphIcon } from '@/components/marketing/icon-type';
import { skills, type SkillIcon } from '@/lib/canvas-skills';
import { CANVAS_NAME } from '@/lib/canvas';

export const metadata: Metadata = {
  title: `Skills — ${CANVAS_NAME}`,
  description: `Eight drop-in agent skills for ${CANVAS_NAME}: daily checks, week planning, grade tracking, bulk grading, course QC and accessibility audits.`,
};

const ICON: Record<SkillIcon, GlyphIcon> = {
  Sunrise,
  CalendarDays,
  TrendingUp,
  MessagesSquare,
  ListChecks,
  ClipboardCheck,
  Accessibility,
  Users,
};

const AUDIENCE_LABEL = { student: 'Student', educator: 'Educator' } as const;

export default function CanvasSkillsPage() {
  const students = skills.filter((s) => s.audience === 'student');
  const educators = skills.filter((s) => s.audience === 'educator');

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <section className="animate-fade-up">
        <h1 className="text-[32px] font-normal leading-[1.08] tracking-tighter lg:text-[40px]">
          Eight skills, ready to drop in.
        </h1>
        <p className="mt-4 max-w-[640px] text-[16px] leading-relaxed text-m-ink/72">
          A skill teaches an agent a whole workflow — which tools to reach for, in what order, and what to do with
          the results. These ship in the repo under{' '}
          <code className="font-mono text-[14px] text-m-ink">skills/</code>; copy one into your client and ask for it
          by name.
        </p>
      </section>

      {[
        { key: 'student', label: 'For students', items: students },
        { key: 'educator', label: 'For educators', items: educators },
      ].map((section, si) => (
        <section key={section.key} className="mt-12 animate-fade-up" style={{ animationDelay: `${60 + si * 40}ms` }}>
          <h2 className="text-[20px] font-medium leading-tight text-m-ink">{section.label}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {section.items.map((skill) => (
              <article key={skill.slug} className="rounded-panel border border-m-border-faint p-5">
                <div className="flex items-start gap-3">
                  <IconTile icon={ICON[skill.icon]} size="md" className="mt-0.5" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-[14px] text-m-ink">{skill.name}</code>
                      <span className="rounded-pill bg-m-ink/[0.059] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-m-ink/56">
                        {AUDIENCE_LABEL[skill.audience]}
                      </span>
                    </div>
                    <p className="mt-2 text-[14px] leading-relaxed text-m-ink/72">{skill.summary}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-m-ink/48">Ask for it like</p>
                  <ul className="mt-1.5 space-y-1">
                    {skill.triggers.map((t) => (
                      <li key={t} className="text-[13px] leading-snug text-m-ink/56">
                        &ldquo;{t}&rdquo;
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-m-ink/48">Tools it uses</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {skill.tools.map((tool) => (
                      <a
                        key={tool}
                        href={`/canvas/tools#${tool}`}
                        className="rounded-card bg-m-ink/[0.039] px-2 py-1 font-mono text-[11px] leading-none text-m-ink/72 transition-colors duration-150 ease-out hover:bg-violet-12 hover:text-violet"
                      >
                        {tool}
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-12 animate-fade-up">
        <PillButton href="/canvas#install" variant="secondary">
          Install the server first
        </PillButton>
      </div>
    </div>
  );
}
