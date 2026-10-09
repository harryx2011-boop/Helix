import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CHECK_TABS, TAB_LABELS, isCheckTab } from '@/lib/checks-tabs';
import { CheckTabs } from '@/components/checks/check-shell';
import { RobotsCheck } from '@/components/checks/robots-check';
import { DiffCheck } from '@/components/checks/diff-check';
import { PdfCheck } from '@/components/checks/pdf-check';
import { SelectorCheck } from '@/components/checks/selector-check';

const DESCRIPTIONS: Record<string, string> = {
  robots: 'Check whether a crawl would be allowed to fetch a URL, using the same robots cache a crawl consults.',
  diff: 'Compare two pieces of text, or two URLs, with the same diff Monitor runs on every check.',
  pdf: 'Find out whether a PDF needs OCR before paying to parse it.',
  selector: 'Test a CSS or XPath selector against a real page and copy the request body that uses it.',
};

export function generateStaticParams() {
  return CHECK_TABS.map((tab) => ({ tab }));
}

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }): Promise<Metadata> {
  const { tab } = await params;
  if (!isCheckTab(tab)) return { title: 'Checks' };
  return {
    title: `${TAB_LABELS[tab]} Check`,
    description: DESCRIPTIONS[tab] as string,
  };
}

export default async function CheckTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isCheckTab(tab)) notFound();

  return (
    <section className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
      <h1 className="truncate font-sans text-[32px] font-medium tracking-tight text-m-ink sm:text-[40px]">Checks</h1>
      <p className="mt-3 max-w-prose font-sans text-[15px] leading-relaxed text-m-ink/56">
        Quick answers about a page, a file, or a change — each one running the same code the API runs.
      </p>

      <div className="mt-8">
        <CheckTabs active={tab} />
      </div>

      <div className="mt-8">
        {tab === 'robots' && <RobotsCheck />}
        {tab === 'diff' && <DiffCheck />}
        {tab === 'pdf' && <PdfCheck />}
        {tab === 'selector' && <SelectorCheck />}
      </div>
    </section>
  );
}
