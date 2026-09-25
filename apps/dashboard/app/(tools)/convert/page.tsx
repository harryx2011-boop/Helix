import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ConverterPanelLoader as ConverterPanel } from '@/components/converter/converter-panel-loader';
import { FormatGrid } from '@/components/converter/format-grid';
import { FORMAT_PAIRS } from '@/lib/converter/formats';

export const metadata: Metadata = {
  title: 'Convert video, audio, images and documents · Helix',
  description:
    'Drop a file, pick the output, download. Runs on ffmpeg and image codecs compiled to WebAssembly, entirely in your browser. Nothing is ever uploaded.',
};

export default function ConvertPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-p-ink sm:text-h1lg">Convert a file</h1>
        <p className="mx-auto mt-3 max-w-[58ch] text-body leading-relaxed text-p-ink-2">
          Video, audio, images and documents. Pick a format, set a size, download the result. The
          file never leaves this tab — conversion runs in a Web Worker on your own machine.
        </p>
      </div>

      <div className="mt-10">
        <ConverterPanel />
      </div>

      <section aria-labelledby="formats-heading" className="mt-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="formats-heading" className="text-h2 font-semibold tracking-[-0.01em] text-p-ink">
              {FORMAT_PAIRS.length} tools, one converter
            </h2>
            <p className="mt-2 max-w-[56ch] text-body text-p-ink-2">
              Every tile opens this converter with that pair already selected. Drop a different file
              and it re-targets.
            </p>
          </div>
          <Link
            href="/convert/tools"
            className="inline-flex h-11 items-center gap-1 self-start text-sm font-medium text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink sm:self-auto"
          >
            See all tools
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-8">
          <FormatGrid limit={8} />
        </div>
      </section>
    </main>
  );
}
