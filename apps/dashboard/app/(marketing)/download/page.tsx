import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Download } from 'lucide-react';
import { PillButton } from '@/components/shared/pill-button';
import { HeroField } from '@/components/marketing/hero-field';
import { InstallSequence } from '@/components/marketing/install-sequence';
import { GithubMark } from '@/components/marketing/github-mark';
import { RELEASES_URL, fetchLatestInstaller, formatBytes } from '@/lib/latest-release';

export const metadata: Metadata = {
  title: 'Download',
  description: 'Helix for Windows: read and watch the web from your own PC. One download, no account.',
};

const FACTS = [
  { label: 'Where it runs', value: 'On your PC. Helix starts everything it needs when it opens, so there is nothing to set up.' },
  { label: 'Account', value: 'None. Helix makes its own access key the first time it opens.' },
  { label: 'AI features', value: 'A few features need an AI. Connect your own account in Settings, or use a model on your PC. The key stays on this PC.' },
  { label: 'Updates', value: 'Helix checks for a new version when it opens, downloads it in the background and installs it when you close the app.' },
  { label: 'First run', value: 'The installer is not code-signed, so Windows may ask you to confirm before it runs.' },
  { label: 'Requirements', value: 'Windows 10 or 11, 64-bit.' },
] as const;

export default async function DownloadPage() {
  const installer = await fetchLatestInstaller();

  return (
    <div className="mx-auto max-w-container px-4 pb-24 pt-16 lg:pt-24">
      <div className="relative">
        <HeroField motif="wave" seed={43} />
        <section className="relative mx-auto max-w-[720px] animate-fade-up text-center">
          <h1 className="text-[36px] font-normal leading-[1.05] tracking-tighter lg:text-[48px]">
            Helix for Windows. <span className="block text-violet">One download.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-m-ink/72">
            Read pages and documents, search, follow a whole site and watch for changes, all from your own PC.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {installer ? (
              <>
                <PillButton href={installer.url} variant="primary">
                  <Download className="h-4 w-4" aria-hidden />
                  Download for Windows
                </PillButton>
                <PillButton href={RELEASES_URL} variant="secondary">
                  <GithubMark className="h-4 w-4" />
                  All releases
                </PillButton>
              </>
            ) : (
              <PillButton href={RELEASES_URL} variant="primary">
                <GithubMark className="h-4 w-4" />
                Watch releases
              </PillButton>
            )}
          </div>
          <p className="mt-4 text-[14px] text-m-ink/72">
            {installer
              ? `Version ${installer.version} · ${formatBytes(installer.bytes)} · Windows 10 and 11, 64-bit`
              : 'The Windows download is coming soon. New versions are listed on the releases page.'}
          </p>
        </section>
      </div>

      <section className="mx-auto mt-16 max-w-[720px] animate-fade-up [animation-delay:60ms]">
        <InstallSequence installer={installer ? `Helix-Setup-${installer.version}.exe` : 'Helix-Setup.exe'} />
      </section>

      <section className="mx-auto mt-16 max-w-[720px]">
        <h2 className="text-[28px] font-normal leading-tight tracking-tight lg:text-[36px]">
          {installer ? 'What you get.' : 'What the app will do.'}
        </h2>
        <dl className="mt-6 overflow-hidden rounded-card border border-m-border-muted bg-m-surface shadow-card-sm">
          {FACTS.map((fact) => (
            <div key={fact.label} className="grid gap-1 border-b border-m-border-faint px-5 py-4 last:border-0 sm:grid-cols-[160px_1fr] sm:gap-6">
              <dt className="text-[14px] text-m-ink/72">{fact.label}</dt>
              <dd className="text-[14px] leading-relaxed text-m-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <Link
          href="/docs/quickstart"
          className="mt-6 inline-flex items-center gap-1.5 text-[14px] text-m-ink/72 transition-colors duration-150 ease-out hover:text-m-ink"
        >
          New to Helix? Read the quickstart <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
