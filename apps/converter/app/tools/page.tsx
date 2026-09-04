import type { Metadata } from 'next';
import Link from 'next/link';
import { FormatGrid } from '@/components/marketing/format-grid';
import { FORMAT_PAIRS, KIND_LABELS, KIND_ORDER, pairsByKind } from '@/lib/formats';

export const metadata: Metadata = {
  title: 'All tools · Converter API',
  description: `Every one of the ${FORMAT_PAIRS.length} converters and compressors, grouped by video, audio, image and GIF.`,
};

export default function ToolsPage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-h1 font-semibold tracking-[-0.02em] text-p-ink sm:text-h1lg">All tools</h1>
            <p className="mt-2 max-w-[56ch] text-body text-p-ink-2">
              {FORMAT_PAIRS.length} entries. Each opens the converter with the pair pre-selected; press
              ⌘K anywhere to jump straight to one.
            </p>
          </div>
          <nav aria-label="Jump to kind" className="flex flex-wrap gap-2">
            {KIND_ORDER.map((k) => (
              <Link
                key={k}
                href={`#${k}`}
                className="inline-flex h-11 items-center gap-1.5 rounded-pill border border-p-line-2 px-4 text-sm font-medium text-p-ink transition-colors duration-150 ease-out hover:bg-p-code active:scale-[0.98]"
              >
                {KIND_LABELS[k]}
                <span className="font-mono text-caption text-p-ink-3">{pairsByKind(k).length}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-12">
          <FormatGrid />
        </div>
      </main>
    </>
  );
}
