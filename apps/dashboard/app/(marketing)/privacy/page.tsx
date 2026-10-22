import type { Metadata } from 'next';
import { HeroField } from '@/components/marketing/hero-field';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Where Helix keeps your data, how provider keys are protected, and what this website collects.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="orbit" seed={43} className="translate-x-16 opacity-60" />
        <div className="relative mx-auto max-w-[720px] animate-fade-up">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Privacy.
          </h1>
          <p className="mt-4 font-mono text-[12px] text-m-ink/64">Last updated: October 22, 2026</p>
        </div>
      </div>

      <article className="prose-helix mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms] space-y-8">
        <p className="text-[14px] italic leading-relaxed text-m-ink/64">
          This is a template. It has not been reviewed by a lawyer. Treat it as a starting point, not legal advice,
          and have it reviewed before relying on it for anything.
        </p>

        <Section title="Where your data lives">
          <p>
            Helix runs on your own machine, from source today and as a Windows app when it ships. Your API keys, their
            usage counters, and the requests and results you run stay in that instance&rsquo;s own database, and
            none of it reaches us. This website has no accounts and no sign-in.
          </p>
        </Section>

        <Section title="Provider keys">
          <p>
            If you add your own LLM, proxy or vector-store credentials in the app, they are encrypted at rest and
            decrypted only at the moment a request needs them. The plaintext is never returned by the API after you
            set it — only the last four characters, so you can confirm which key is active.
          </p>
        </Section>

        <Section title="What we don't do">
          <p>
            We do not sell your data or the content of your requests. We do not send your provider credentials
            anywhere other than the provider you configured them for. Helix takes no margin on inference — your
            provider bills you directly, and that billing relationship is between you and them.
          </p>
        </Section>

        <Section title="Third parties">
          <p>
            This website adds no third-party trackers. The app calls only the providers you configure, with the
            credentials you gave it.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can revoke an API key at any time from the app, which stops it from being used immediately. You can
            remove a stored provider key the same way. Everything else is in your own database, under your control.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy:{' '}
            <a
              href="mailto:harryx2011@gmail.com"
              className="text-violet underline decoration-violet-40 underline-offset-4 hover:decoration-violet"
            >
              harryx2011@gmail.com
            </a>
            .
          </p>
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
