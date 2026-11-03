import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from '@/components/icons/lucide';
import { PillButton } from '@/components/shared/pill-button';
import { HeroField } from '@/components/marketing/hero-field';
import { GithubMark } from '@/components/marketing/github-mark';
import { CodePanel } from '@/components/shared/code-panel';
import { RELEASES_URL } from '@/lib/latest-release';

export const metadata: Metadata = {
  title: 'Run it locally',
  description: 'Helix runs on your own machine and opens in your browser: the API, the page reader and the document reader, all on 127.0.0.1.',
};

const SETUP = [
  'git clone https://github.com/harryx2011-boop/Helix',
  'cd Helix',
  'corepack pnpm install --frozen-lockfile',
  'uv sync --directory apps/scrape',
  'uv sync --frozen --directory apps/extract',
  'corepack pnpm --filter @helix/desktop web:ui',
  'corepack pnpm --filter @helix/desktop web',
];

const FACTS = [
  { label: 'Where it runs', value: 'On your machine. Every service runs locally: the API, the page reader and the document reader. Your browser is only the window.' },
  { label: 'Who can open it', value: 'Only you. Helix listens on 127.0.0.1 and refuses any page, address or request that does not carry the key printed for that run.' },
  { label: 'Account', value: 'None. Helix creates its own API key the first time it starts.' },
  { label: 'Your keys', value: 'Model and search keys stay on this machine and go only to the providers you choose.' },
  { label: 'Updates', value: 'Run git pull and the setup steps again. Helix does not update itself.' },
  { label: 'Requirements', value: 'Windows 10 or 11, 64-bit, with Git, Node.js 22 or newer and uv.' },
] as const;

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="wave" seed={43} />
        <section className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Helix, on your machine. <span className="block text-violet">Opens in your browser.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
            The playground, your keys, crawls and monitors, with every service it needs started by one command. There
            is no installer: you run it from the source and open the link it prints.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PillButton href="https://github.com/harryx2011-boop/Helix" variant="primary">
              <GithubMark className="h-4 w-4" />
              Get the source
            </PillButton>
            <PillButton href={RELEASES_URL} variant="secondary">
              Older Windows installers
            </PillButton>
          </div>
          <p className="mt-4 text-[14px] text-m-ink/72">Windows 10 and 11, 64-bit. The last installer was version 2.3.2.</p>
        </section>
      </div>

      <section className="mx-auto mt-16 max-w-[720px] animate-fade-up [animation-delay:60ms]">
        <CodePanel chrome="terminal" label="Helix — first run" copyText={SETUP.join('\n')}>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed sm:text-[13px]">
            {SETUP.map((line) => (
              <div key={line}>{`> ${line}`}</div>
            ))}
          </pre>
        </CodePanel>
        <p className="mt-3 text-[14px] leading-relaxed text-m-ink/72">
          The last command prints a link. Open that link, not the bare address: the key at its end is what lets your
          browser in, and it changes on every start. Press Ctrl+C in the terminal to stop Helix.
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-[720px]">
        <h2 className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">What you get.</h2>
        <dl className="mt-6 overflow-hidden rounded-card border border-m-border-muted bg-m-surface shadow-card-sm">
          {FACTS.map((fact) => (
            <div key={fact.label} className="grid gap-1 border-b border-m-border-faint px-5 py-4 last:border-0 sm:grid-cols-[160px_1fr] sm:gap-6">
              <dt className="text-[14px] text-m-ink/72">{fact.label}</dt>
              <dd className="text-[14px] leading-relaxed text-m-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <Link
          href="/self-host"
          className="mt-6 inline-flex items-center gap-1.5 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink"
        >
          Prefer Docker or the hosted services? Read the self-host guide <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
