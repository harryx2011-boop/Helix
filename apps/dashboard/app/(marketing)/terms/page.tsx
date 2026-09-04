import type { Metadata } from 'next';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { HeroField } from '@/components/marketing/hero-field';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms of use for the Helix hosted app and the Apache-2.0 licence covering the self-hosted software.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="orbit" seed={47} className="translate-x-16 opacity-60" />
        <div className="relative mx-auto max-w-[720px] animate-fade-up">
          <SectionEyebrow step="LEGAL" label="TERMS" sub="hosted app and licence" />
          <h1 className="mt-6 text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Terms of use.
          </h1>
        </div>
      </div>

      <article className="prose-helix mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms] space-y-8">
        <p className="text-[14px] italic leading-relaxed text-m-ink/56">
          This is a template. It has not been reviewed by a lawyer. Treat it as a starting point, not legal advice,
          and have it reviewed before relying on it for anything.
        </p>

        <Section title="What Helix is">
          <p>
            Helix is a self-hostable, bring-your-own-key web-data API. The software is open source under the
            Apache-2.0 licence. This hosted app at this site is one way to run it without operating your own
            infrastructure; running your own instance is equally supported and covered by the licence, not by these
            terms.
          </p>
        </Section>

        <Section title="The software licence">
          <p>
            The Helix source code is licensed under Apache-2.0. That licence, not this page, governs your right to
            use, modify, self-host and redistribute the software. Nothing here restricts what the licence already
            grants you. The full licence text lives in the repository at{' '}
            <a
              href="https://github.com/helix-dev/helix/blob/main/LICENSE"
              className="text-violet underline decoration-violet-40 underline-offset-4 hover:decoration-violet"
            >
              LICENSE
            </a>
            .
          </p>
        </Section>

        <Section title="Using the hosted app">
          <p>
            An account gets you API keys, usage tracking and a dashboard on infrastructure we operate. You are
            responsible for the requests made with your keys, including making sure you have the right to fetch,
            parse or crawl the targets you point Helix at, and for complying with the target site&apos;s own terms and
            robots.txt where applicable.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>
            Do not use the hosted app to attempt unauthorised access to systems, to evade rate limits or security
            controls on a scale intended to harm a target, to scrape data for the purpose of harassment or
            impersonation, or to violate any law applicable to you. We may suspend a key used this way.
          </p>
        </Section>

        <Section title="Provider keys">
          <p>
            If you add your own LLM, proxy or vector-store provider key to the hosted app, it is encrypted at rest
            and used only to make calls on your behalf against the provider you configured. Your provider bills you
            directly; Helix takes no margin on inference.
          </p>
        </Section>

        <Section title="No warranty">
          <p>
            The hosted app and the underlying software are provided as-is, without warranty of any kind, to the
            fullest extent the law allows. We do not guarantee uninterrupted availability, that every fetch will
            succeed, or that extracted data will be accurate — targets change, block, or return malformed content,
            and Helix reports that as a typed failure rather than guessing.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            These terms may change as the hosted app changes. Continuing to use the hosted app after a change means
            you accept the update. The self-hosted software&apos;s licence does not change retroactively for versions
            you have already deployed.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about these terms: [contact email].</p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[20px] font-normal leading-tight tracking-tight text-m-ink">{title}</h2>
      <div className="mt-3 text-[15px] leading-relaxed text-m-ink/72">{children}</div>
    </section>
  );
}
