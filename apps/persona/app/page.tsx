'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, Link2, PenLine, Wand2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Nav } from '@/components/marketing/nav';
import { RolePill } from '@/components/marketing/role-pill';
import { SearchDemo } from '@/components/marketing/search-demo';
import { AppMockup } from '@/components/marketing/app-mockup';
import { WizardCard } from '@/components/marketing/wizard-card';
import { RolesGrid } from '@/components/marketing/roles-grid';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';
import { AsciiFluid, ScrollStrip } from '@/components/marketing/ambient';
import { FrameBand, FrameColumn, PillLink, SectionHeader } from '@/components/marketing/frame';

const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const heroItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.23, 1, 0.32, 1] } },
};

const settled = { hidden: {}, show: {} };

const WHAT_YOU_GET = [
  {
    icon: Wand2,
    title: 'The wizard',
    body: 'One question per placeholder, in plain language. The prompt fills in as you answer.',
  },
  {
    icon: BookOpen,
    title: 'Setup guides per platform',
    body: 'Chat, email, code, SQL and more: each persona carries the config steps for where it runs.',
  },
  {
    icon: PenLine,
    title: 'An editor that exports',
    body: 'Fork into a block editor with tables, then export Markdown, plain text, JSON or PDF.',
  },
  {
    icon: Link2,
    title: 'Share by link',
    body: 'Freeze a filled prompt into a link. Anyone who opens it can read it and fork their own copy.',
  },
];

export default function HomePage() {
  const reduced = useReducedMotion();

  return (
    <>
      <Nav />

      <main>
        <FrameColumn>
          <section className="grid-glow relative overflow-hidden">
            <AsciiFluid
              cols={28}
              rows={14}
              seed={3}
              className="absolute left-2 top-1/2 hidden -translate-y-1/2 lg:block [mask-image:linear-gradient(to_right,black_60%,transparent)]"
            />
            <AsciiFluid
              cols={28}
              rows={14}
              seed={15}
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 lg:block [mask-image:linear-gradient(to_left,black_60%,transparent)]"
            />
            <motion.div
              className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-28"
              variants={reduced ? settled : heroContainer}
              initial="hidden"
              animate="show"
            >
              <div className="mx-auto max-w-2xl text-center">
                <motion.h1
                  variants={reduced ? settled : heroItem}
                  className="text-[40px] font-semibold leading-[1.02] tracking-[-0.02em] text-p-ink sm:text-[64px]"
                  style={{ textWrap: 'balance' }}
                >
                  System prompts for
                  <br />
                  <RolePill className="mx-1" />
                  teams
                </motion.h1>
                <motion.p
                  variants={reduced ? settled : heroItem}
                  className="mx-auto mt-6 max-w-[58ch] text-[18px] leading-relaxed text-p-ink-2"
                >
                  A library of role-specific system prompts. Each comes with setup guides per platform and
                  a fill-in-the-blanks wizard that turns the template into your prompt. Free. No account
                  needed.
                </motion.p>

                <motion.div
                  variants={reduced ? settled : heroItem}
                  className="mt-8 flex flex-wrap items-center justify-center gap-3"
                >
                  <PillLink href="/roles">
                    Browse the library
                    <ArrowRight className="h-4 w-4" />
                  </PillLink>
                  <PillLink href="#how" variant="secondary">
                    See how it works
                  </PillLink>
                </motion.div>
              </div>

              <motion.div variants={reduced ? settled : heroItem} className="mx-auto mt-14 max-w-md">
                <SearchDemo />
              </motion.div>
            </motion.div>
          </section>

          <FrameBand seed={3} />

          <section className="py-16 sm:py-24">
            <ScrollReveal>
              <SectionHeader
                index="01 / 04"
                label="the library"
                title="Start from a role you recognise."
                body="Support, sales, security, legal and the rest of the org chart. Each role ships with competing personas and the setup steps for where it runs."
              />
            </ScrollReveal>
            <div className="mt-10 px-6">
              <RolesGrid />
            </div>
          </section>

          <FrameBand seed={11} />

          <section id="how" className="scroll-mt-16 py-16 sm:py-24">
            <div className="grid gap-10 px-6 lg:grid-cols-[1fr_520px] lg:items-center lg:gap-16">
              <ScrollReveal>
                <h2
                  className="text-[28px] font-semibold leading-[1.08] tracking-[-0.015em] text-p-ink sm:text-[36px]"
                  style={{ textWrap: 'balance' }}
                >
                  Fill in the blanks, not the whole prompt.
                </h2>
                <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-p-ink-2 sm:text-[16px]">
                  The engine scans every persona for its{' '}
                  <code className="rounded-[4px] bg-p-code px-1.5 py-0.5 font-mono text-[0.86em] text-p-ink">{'{{PLACEHOLDER}}'}</code>{' '}
                  tokens and asks for each value once, in plain language.
                </p>
                <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-p-ink-2 sm:text-[16px]">
                  Answers are saved, so one company name and help centre URL carry through to every persona
                  that needs them.
                </p>
                <p className="mt-6 font-mono text-[12px] uppercase tracking-wide text-p-ink-3">
                  [ <span className="text-blue">02 / 04</span> ] · the wizard
                </p>
              </ScrollReveal>
              <ScrollReveal delay={0.06}>
                <WizardCard />
              </ScrollReveal>
            </div>
          </section>

          <FrameBand seed={19} />

          <section className="py-16 sm:py-24">
            <ScrollReveal>
              <SectionHeader
                index="03 / 04"
                label="the app"
                title="Search, fork, edit, export."
                body="Filter by department, platform and tone. Fork any persona into an editor, share a snapshot by link, and export it where your agent runs."
              />
            </ScrollReveal>
            <div className="mt-10 px-6">
              <AppMockup />
            </div>
          </section>

          <FrameBand seed={23} />

          <section className="py-16 sm:py-24">
            <ScrollReveal>
              <SectionHeader index="04 / 04" label="what you get" title="Four things, no account." />
            </ScrollReveal>
            <ScrollReveal delay={0.06}>
              <div className="mt-10 grid gap-8 px-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-p-line">
                {WHAT_YOU_GET.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="lg:px-8 lg:first:pl-0 lg:last:pr-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-card bg-blue-soft text-blue">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                    <h3 className="mt-4 text-[15px] font-semibold text-p-ink">{title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-p-ink-2">{body}</p>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </section>

          <ScrollStrip seed={7} className="border-t border-p-line" />

          <section className="relative overflow-hidden border-t border-p-line bg-p-surface py-20 sm:py-28">
            <AsciiFluid
              cols={24}
              rows={10}
              seed={31}
              className="absolute bottom-0 left-4 hidden opacity-70 lg:block [mask-image:linear-gradient(to_right,black_50%,transparent)]"
            />
            <AsciiFluid
              cols={24}
              rows={10}
              seed={37}
              className="absolute bottom-0 right-4 hidden opacity-70 lg:block [mask-image:linear-gradient(to_left,black_50%,transparent)]"
            />
            <ScrollReveal>
              <div className="relative mx-auto max-w-2xl px-6 text-center">
                <h2 className="text-[28px] font-semibold tracking-[-0.015em] text-p-ink sm:text-[36px]">Start with a role.</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-p-ink-2">
                  Pick one, fill in the blanks, and ship the prompt where your agent already runs.
                </p>
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                  <PillLink href="/roles">
                    Browse the library
                    <ArrowRight className="h-4 w-4" />
                  </PillLink>
                  <PillLink href="https://github.com/harryx2011-boop/Helix" variant="secondary" external>
                    Run it yourself
                  </PillLink>
                </div>
              </div>
            </ScrollReveal>
          </section>
        </FrameColumn>
      </main>

      <footer className="border-t border-p-line">
        <FrameColumn>
          <div className="flex flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-p-ink-3 sm:flex-row sm:items-center">
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-[14px] font-semibold text-p-ink">Persona</span>
              <span className="text-[12px]">Part of Helix. Open source, Apache-2.0.</span>
            </div>
            <nav className="flex flex-wrap items-center gap-5">
              <Link href="/roles" className="transition-colors duration-150 ease-out hover:text-p-ink">
                Library
              </Link>
              <a href="#how" className="transition-colors duration-150 ease-out hover:text-p-ink">
                How it works
              </a>
              <a href="https://helixapi-dev.vercel.app" target="_blank" rel="noreferrer" className="transition-colors duration-150 ease-out hover:text-p-ink">
                Helix
              </a>
              <a href="https://github.com/harryx2011-boop/Helix" target="_blank" rel="noreferrer" className="transition-colors duration-150 ease-out hover:text-p-ink">
                GitHub
              </a>
            </nav>
          </div>
        </FrameColumn>
      </footer>
    </>
  );
}
