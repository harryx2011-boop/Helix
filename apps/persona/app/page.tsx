'use client';

import Link from 'next/link';
import { ArrowRight, Wand2, BookOpen, PenLine } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Nav } from '@/components/marketing/nav';
import { RolePill } from '@/components/marketing/role-pill';
import { SearchDemo } from '@/components/marketing/search-demo';
import { AppMockup } from '@/components/marketing/app-mockup';
import { WizardCard } from '@/components/marketing/wizard-card';
import { WizardMockup } from '@/components/marketing/wizard-mockup';
import { EditorMockup } from '@/components/marketing/editor-mockup';
import { RolesGrid } from '@/components/marketing/roles-grid';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';

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
    body: 'Answer one question per placeholder, in plain language, and watch the prompt fill in live.',
  },
  {
    icon: BookOpen,
    title: 'Setup guides per platform',
    body: 'Chat, email, code, SQL, and more: each persona ships with the config steps for where you deploy it.',
  },
  {
    icon: PenLine,
    title: 'An editor with export',
    body: 'Clean up the result in a block editor, then export to Markdown, plain text, JSON, or PDF.',
  },
];

export default function HomePage() {
  const reduced = useReducedMotion();

  return (
    <>
      <Nav />

      <main>
        <section className="relative overflow-hidden grid-glow">
          <motion.div
            className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28"
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
                A library of role-specific system prompts. Each comes with setup guides per
                platform and a fill-in-the-blanks wizard that turns the template into your prompt.
                Free. No account needed.
              </motion.p>

              <motion.div
                variants={reduced ? settled : heroItem}
                className="mt-8 flex flex-wrap items-center justify-center gap-3"
              >
                <Link
                  href="/roles"
                  className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-p-ink px-6 text-[14px] font-medium text-p-bg transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-card"
                >
                  Browse the library
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how"
                  className="inline-flex h-11 items-center rounded-pill border border-p-line-2 px-6 text-[14px] font-medium text-p-ink transition-colors duration-150 ease-out hover:bg-p-code"
                >
                  See how it works
                </a>
              </motion.div>
            </div>

            <motion.div variants={reduced ? settled : heroItem} className="mx-auto mt-14 max-w-md">
              <SearchDemo />
            </motion.div>
          </motion.div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-p-bg" />
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <AppMockup />
        </section>

        <section id="how" className="border-y border-p-line bg-p-surface py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <WizardCard />

            <div className="mt-16">
              <ScrollReveal>
                <h3 className="text-center text-[15px] font-semibold text-p-ink">See it in the app</h3>
              </ScrollReveal>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <ScrollReveal delay={0.06}>
                  <WizardMockup />
                </ScrollReveal>
                <ScrollReveal delay={0.12}>
                  <EditorMockup />
                </ScrollReveal>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <ScrollReveal>
            <div className="grid gap-10 sm:grid-cols-3 sm:divide-x sm:divide-p-line">
              {WHAT_YOU_GET.map(({ icon: Icon, title, body }) => (
                <div key={title} className="sm:px-8 first:sm:pl-0 last:sm:pr-0">
                  <Icon className="h-[18px] w-[18px] text-p-ink" strokeWidth={1.75} />
                  <h4 className="mt-3 text-[15px] font-semibold text-p-ink">{title}</h4>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-p-ink-2">{body}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <ScrollReveal>
            <div className="text-center">
              <h2 className="text-[28px] font-semibold tracking-[-0.01em] text-p-ink sm:text-[32px]">
                The library.
              </h2>
              <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-p-ink-2">
                Start from a role you recognise.
              </p>
            </div>
          </ScrollReveal>
          <div className="mt-10">
            <RolesGrid />
          </div>
        </section>

        <section className="border-t border-p-line bg-p-surface py-20 sm:py-28">
          <ScrollReveal>
            <div className="mx-auto max-w-6xl px-6 text-center">
              <h2 className="text-[28px] font-semibold tracking-[-0.01em] text-p-ink sm:text-[32px]">
                Start with a role.
              </h2>
              <div className="mt-7">
                <Link
                  href="/roles"
                  className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-p-ink px-6 text-[14px] font-medium text-p-bg transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-card"
                >
                  Browse the library
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <p className="mt-6 text-sm text-p-ink-3">
                Built by Helix. Open source, run it yourself.
              </p>
            </div>
          </ScrollReveal>
        </section>
      </main>

      <footer className="border-t border-p-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-10 text-sm text-p-ink-3 sm:flex-row sm:justify-between">
          <span>Persona</span>
          <nav className="flex flex-wrap items-center justify-center gap-5">
            <Link href="/roles" className="transition-colors duration-150 ease-out hover:text-p-ink">
              Library
            </Link>
            <a href="#how" className="transition-colors duration-150 ease-out hover:text-p-ink">
              How it works
            </a>
            <a
              href="https://helixapi-dev.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="transition-colors duration-150 ease-out hover:text-p-ink"
            >
              Helix
            </a>
            <a
              href="https://github.com/harryx2011-boop/Helix"
              target="_blank"
              rel="noreferrer"
              className="transition-colors duration-150 ease-out hover:text-p-ink"
            >
              GitHub
            </a>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-8 text-[12px] text-p-ink-3">Persona is part of Helix.</div>
      </footer>
    </>
  );
}
