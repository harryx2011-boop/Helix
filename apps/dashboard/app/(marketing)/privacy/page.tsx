import type { Metadata } from 'next';
import Link from 'next/link';
import { HeroField } from '@/components/marketing/hero-field';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Where Helix keeps your data, what leaves your PC and what this website collects.',
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
        </div>
      </div>

      <article className="prose-helix mx-auto mt-14 max-w-[720px] animate-fade-up [animation-delay:60ms] space-y-8">
        <p className="text-[14px] italic leading-relaxed text-m-ink/56">
          This is a plain-language template. A lawyer has not reviewed it. Treat it as a starting point, not legal
          advice.
        </p>

        <Section title="Where your data lives">
          <p>
            Helix runs on your own PC. Your results, your settings and the access keys you create stay in
            Helix&rsquo;s folder on your computer, and none of it reaches us. This website has no accounts and no
            sign-in.
          </p>
        </Section>

        <Section title="AI and search accounts">
          <p>
            If you connect an AI account or a search service, Helix sends it what the feature needs, such as the text
            of a page or a search question, using the key you gave it. Keys are stored encrypted. After you save one,
            the app shows only its last four characters.
          </p>
        </Section>

        <Section title="What we don't do">
          <p>
            We do not sell your data or the content of your requests. Helix does not send us usage statistics. We do
            not send your keys anywhere except to the provider you set them up for. Your provider bills you directly,
            and Helix adds nothing on top.
          </p>
        </Section>

        <Section title="Third parties">
          <p>
            This website adds no third-party trackers. The app talks to the sites you ask it to read, to any AI or
            search account you connect and to GitHub, to check for updates and to download an extra add-on the first
            time you use a feature that needs one.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can revoke an access key at any time in the app, and remove a stored provider key the same way.
            Uninstalling Helix keeps your data, so you can delete the Helix folder yourself if you want it gone.{' '}
            <Link href="/docs/privacy-and-data" className="text-violet underline decoration-violet-40 underline-offset-4">
              The full list of what stays and what leaves
            </Link>{' '}
            is in the docs.
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
