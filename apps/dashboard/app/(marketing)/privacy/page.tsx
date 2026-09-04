import type { Metadata } from 'next';
import { SectionEyebrow } from '@/components/marketing/section-eyebrow';
import { HeroField } from '@/components/marketing/hero-field';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What the Helix hosted app stores, how provider keys are protected, and what self-hosting means for your data.',
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
          <SectionEyebrow step="LEGAL" label="PRIVACY" sub="what the hosted app stores" className="mt-4" />
        </div>
      </div>

      <article className="prose-helix mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms] space-y-8">
        <p className="text-[14px] italic leading-relaxed text-m-ink/56">
          This is a template. It has not been reviewed by a lawyer. Treat it as a starting point, not legal advice,
          and have it reviewed before relying on it for anything.
        </p>

        <Section title="Two ways to run Helix">
          <p>
            Helix is self-hostable software: run it yourself and no data ever reaches us. This page describes the
            hosted app at this site, which uses Clerk for authentication and Supabase for account, key and run
            storage. If you self-host instead, this page does not apply — you control the database.
          </p>
        </Section>

        <Section title="What the hosted app stores">
          <p>
            Your account details (via Clerk), your API keys and their usage counters, and metadata about the
            requests you make (timestamps, endpoint, status) so the dashboard can show you what happened. We do
            not store the full content of every page you scrape by default; check the retention settings for your
            plan for anything that goes beyond request metadata.
          </p>
        </Section>

        <Section title="Provider keys">
          <p>
            If you add your own LLM, proxy or vector-store credentials in the dashboard, they are encrypted at rest
            and decrypted only at the moment a request needs them. The plaintext is never returned by the API after
            you set it — only the last four characters, so you can confirm which key is active.
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
            Authentication runs through Clerk; account and application data is stored in Supabase (Postgres). Both
            process data on our behalf under their own security commitments. We do not add further third-party
            trackers to the hosted app beyond what operating the service requires.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can delete an API key at any time from the dashboard, which stops it from being used immediately.
            You can remove a stored provider key the same way. For account deletion or a full data export, contact
            us using the address below.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about this policy: [contact email].</p>
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
