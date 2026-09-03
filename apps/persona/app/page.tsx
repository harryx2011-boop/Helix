import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Nav } from '@/components/marketing/nav';
import { RolePill } from '@/components/marketing/role-pill';
import { SearchDemo } from '@/components/marketing/search-demo';
import { AppMockup } from '@/components/marketing/app-mockup';
import { WizardCard } from '@/components/marketing/wizard-card';
import { RolesGrid } from '@/components/marketing/roles-grid';

export default function HomePage() {
  return (
    <>
      <Nav />

      <main>
        <section className="relative overflow-hidden grid-glow">
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-p-ink sm:text-6xl">
                System prompts for
                <br />
                <RolePill className="mx-1" />
                teams
              </h1>
              <p className="mx-auto mt-6 max-w-[560px] text-lg leading-relaxed text-p-ink-2">
                Eleven roles, each with competing personas, setup guides per platform, and a
                fill-in-the-blanks wizard that turns a template into your prompt. Free. No
                account needed.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/roles"
                  className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-p-ink px-6 text-[14px] font-medium text-white transition-transform duration-150 ease-out hover:-translate-y-0.5"
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
              </div>
            </div>

            <div className="mx-auto mt-14 max-w-md">
              <SearchDemo />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <AppMockup />
        </section>

        <section id="how" className="border-y border-p-line bg-p-surface py-20">
          <div className="mx-auto max-w-6xl px-6">
            <WizardCard />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-p-ink sm:text-[34px]">
            Eleven roles, ready to configure.
          </h2>
          <div className="mt-10">
            <RolesGrid />
          </div>
        </section>

        <section className="border-t border-p-line bg-p-surface py-20">
          <div className="mx-auto max-w-6xl px-6 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-p-ink sm:text-[34px]">
              Start with a role.
            </h2>
            <div className="mt-7">
              <Link
                href="/roles"
                className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-p-ink px-6 text-[14px] font-medium text-white transition-transform duration-150 ease-out hover:-translate-y-0.5"
              >
                Browse the library
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-6 text-sm text-p-ink-3">
              Built by Helix. Open source, run it yourself.
            </p>
          </div>
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
      </footer>
    </>
  );
}
