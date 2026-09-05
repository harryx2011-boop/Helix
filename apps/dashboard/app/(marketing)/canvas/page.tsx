import type { Metadata } from 'next';
import { ArrowRight, Lock, ShieldCheck, Server, Terminal, Users } from 'lucide-react';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { PillButton } from '@/components/marketing/pill-button';
import { CodePanel, CodeBlock } from '@/components/marketing/code-panel';
import { HeroField } from '@/components/marketing/hero-field';
import { ScrollStrip } from '@/components/marketing/scroll-strip';
import { BentoCard } from '@/components/marketing/bento';
import { CanvasMark } from '@/components/marketing/canvas-mark';
import { CanvasInstall } from '@/components/marketing/canvas/install';
import {
  CANVAS_MODULES,
  CANVAS_NAME,
  CANVAS_REPO,
  TOOL_CONFIRMED,
  TOOL_READONLY,
  TOOL_TOTAL,
} from '@/lib/canvas';

export const metadata: Metadata = {
  title: `${CANVAS_NAME} — your Canvas LMS as MCP tools`,
  description: `${TOOL_TOTAL} MCP tools over your own Canvas account. Runs on your machine with your own token; every tool that changes Canvas shows a preview first.`,
};

const DEMO = `> what's due this week, and am I missing anything?

  ◆ get_upcoming_assignments        3 courses
  ◆ get_submission_status           12 assignments
  ◆ list_announcements              2 unread

  Due Thursday   PHYS 211  Problem Set 7
  Due Friday     ENG 101   Rhetorical analysis draft
  Missing        PHYS 211  Lab writeup 5   (was due Monday)

  2 unread announcements in ENG 101.`;

const CONFIRM = `> post my draft reply to the ENG 101 thread

  ⚠ post_discussion_entry would change Canvas.

    course   ENG 101 (2381094)
    topic    Week 6 — close reading
    body     "The passage's shift to present tense..."

  Nothing has been posted. Call again with confirm=true to go ahead.`;

export default function CanvasPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="segments" seed={17} />
        <section className="relative mx-auto max-w-[760px] animate-fade-up text-center">
          <CanvasMark className="mx-auto h-12 w-12" />
          <h1 className="mt-6 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Your Canvas account,
            <span className="block text-violet">{TOOL_TOTAL} tools an agent can use.</span>
          </h1>
          <SectionEyebrow step="CANVAS" label={CANVAS_NAME} sub="local, your own token" className="mt-4" />
          <p className="mx-auto mt-5 max-w-[600px] text-[16px] leading-relaxed text-m-ink/72">
            An MCP server that hands Claude, Cursor or any MCP client your Canvas LMS — courses, assignments,
            grades, discussions, rubrics, peer reviews. It runs on your machine, authenticates with a token you
            issue, and shows you a preview before it changes anything.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="#install" variant="primary">
              Install it <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </PillButton>
            <PillButton href="/canvas/tools" variant="secondary">
              Browse {TOOL_TOTAL} tools
            </PillButton>
          </div>
        </section>
      </div>

      <section className="mx-auto mt-16 max-w-[880px] animate-fade-up [animation-delay:60ms]">
        <SectionEyebrow step="01" label="IN PRACTICE" sub="one question, several tools" />
        <div className="relative mt-4">
          <div className="pointer-events-none absolute inset-0 rounded-panel shadow-cutout" aria-hidden />
          <CodePanel chrome="terminal" label="claude code" copyText={DEMO}>
            <CodeBlock dark>{DEMO}</CodeBlock>
          </CodePanel>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-m-ink/72">
          The agent picks the tools. You asked one question; it resolved the courses, read three endpoints and
          reconciled them into an answer — without you naming a single course id.
        </p>
      </section>

      <ScrollStrip seed={17} direction="right" className="mt-16" />

      <section className="mx-auto mt-16 max-w-[880px] animate-fade-up">
        <h2 className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">
          It shows you the change before it makes it.
        </h2>
        <SectionEyebrow step="02" label="THE CONFIRM GATE" sub={`${TOOL_CONFIRMED} tools`} className="mt-3" />
        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-m-ink/72">
          Every tool that changes Canvas takes a <code className="font-mono text-[14px] text-m-ink">confirm</code>{' '}
          argument. Without it you get a preview of exactly what would change and no request is made. This is what
          stops a misread instruction from posting to a discussion or overwriting a page.
        </p>
        <div className="relative mt-6">
          <CodePanel chrome="terminal" label="preview" copyText={CONFIRM}>
            <CodeBlock dark>{CONFIRM}</CodeBlock>
          </CodePanel>
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-[1080px] animate-fade-up">
        <h2 className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">
          Nothing leaves your machine.
        </h2>
        <SectionEyebrow step="03" label="WHERE IT RUNS" sub="no service in the middle" className="mt-3" />
        <div
          data-reveal-group
          className="mt-6 grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-faint sm:grid-cols-6"
        >
          <BentoCard
            icon={Server}
            span="third"
            eyebrow="Local"
            lead="It runs as a process you start."
            body="Over stdio by default, so your client spawns it directly. There is no hosted Canvas Connect, no account, and no server of ours between you and your institution."
          />
          <BentoCard
            icon={Lock}
            span="third"
            eyebrow="Your token"
            lead="A Canvas personal access token, in your own .env."
            body="Client config files never carry it — the server reads .env from its own folder. Permissions are exactly what your Canvas role grants: a student token cannot grade."
          />
          <BentoCard
            icon={ShieldCheck}
            span="third"
            eyebrow="Anonymisation"
            lead="Student names can be replaced everywhere."
            body="CANVAS_ANONYMIZE_STUDENTS swaps every name for a stable pseudonym across every tool's output, so a class-wide analysis need not put real names in front of a model."
          />
        </div>
      </section>

      <ScrollStrip seed={23} direction="left" className="mt-16" />

      <section className="mx-auto mt-16 max-w-[1080px] animate-fade-up">
        <h2 className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">
          Fourteen groups, {TOOL_TOTAL} tools.
        </h2>
        <SectionEyebrow step="04" label="WHAT IT COVERS" sub={`${TOOL_READONLY} read-only`} className="mt-3" />
        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-m-ink/72">
          Most of the surface is read-only. The rest changes Canvas, and all of it is gated.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CANVAS_MODULES.map((m) => (
            <div key={m.module} className="rounded-card border border-m-border-faint p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium text-m-ink">{m.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-m-ink/48">{m.count}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-snug text-m-ink/56">{m.blurb}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <PillButton href="/canvas/tools" variant="secondary">
            Every tool, with its parameters <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </PillButton>
        </div>
      </section>

      <section id="install" className="mx-auto mt-16 max-w-[880px] scroll-mt-24 animate-fade-up">
        <h2 className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">Install it.</h2>
        <SectionEyebrow step="05" label="SETUP" sub="python 3.11+" className="mt-3" />
        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-m-ink/72">
          Clone the repo, install it into a virtualenv, put your Canvas URL and token in{' '}
          <code className="font-mono text-[14px] text-m-ink">.env</code>, then point your client at the executable.
        </p>
        <CanvasInstall className="mt-6" />
      </section>

      <section className="mx-auto mt-16 max-w-[880px] animate-fade-up">
        <div className="rounded-panel border border-m-border-faint p-8 text-center">
          <h2 className="text-[24px] font-normal leading-tight tracking-tight lg:text-[28px]">
            Eight skills ship with it.
          </h2>
          <SectionEyebrow step="06" label="SKILLS" sub="student and educator" className="mt-3" />
          <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-relaxed text-m-ink/72">
            Drop-in files that teach an agent a whole workflow — a daily check, a week plan, bulk grading, an
            accessibility audit — rather than one tool at a time.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="/canvas/skills" variant="primary">
              <Users className="h-3.5 w-3.5" aria-hidden /> Browse the skills
            </PillButton>
            <PillButton href={CANVAS_REPO.replace(/\.git$/, '')} variant="secondary">
              <Terminal className="h-3.5 w-3.5" aria-hidden /> Source on GitHub
            </PillButton>
          </div>
        </div>
      </section>

      <p className="mx-auto mt-10 max-w-[720px] text-center text-[12px] leading-relaxed text-m-ink/48">
        Instructure and Canvas are trademarks of Instructure, Inc. {CANVAS_NAME} is an independent tool that talks
        to a Canvas installation using your own credentials, and is not affiliated with or endorsed by Instructure.
      </p>
    </div>
  );
}
