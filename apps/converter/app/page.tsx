import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Hero } from '@/components/marketing/hero';
import { FormatGrid } from '@/components/marketing/format-grid';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { FORMAT_PAIRS } from '@/lib/formats';

export const metadata: Metadata = {
  title: 'Converter API · Convert video, audio and images, entirely in your browser',
  description:
    'Drop a file, pick the output, download. Sixty-three conversions and six compressors, run by ffmpeg and image codecs compiled to WebAssembly. Nothing is ever uploaded. Part of Helix.',
};

export default function HomePage() {
  return (
    <>
      <main>
        <Hero />

        <section aria-labelledby="formats-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="formats-heading" className="text-h2 font-semibold tracking-[-0.01em] text-p-ink sm:text-h2lg">
                {FORMAT_PAIRS.length} tools, one converter
              </h2>
              <p className="mt-2 max-w-[56ch] text-body text-p-ink-2">
                Every tile opens the same converter with that pair already selected. Drop a
                different file and it re-targets.
              </p>
            </div>
            <Link
              href="/tools"
              className="inline-flex h-11 items-center gap-1 self-start text-sm font-medium text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink sm:self-auto"
            >
              See all tools
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-10">
            <FormatGrid limit={8} />
          </div>
        </section>

        <section
          id="private"
          aria-labelledby="private-heading"
          className="border-y border-p-line bg-p-surface py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 id="private-heading" className="text-h2 font-semibold tracking-[-0.01em] text-p-ink sm:text-h2lg">
                Your file never leaves this tab
              </h2>
              <p className="mt-2 text-body text-p-ink-2">
                Conversion runs in a Web Worker, in your browser, on your own machine. Video and
                audio go through ffmpeg compiled to WebAssembly; images through their own codec
                set. There is no upload, no account, and no server that ever sees the bytes.
              </p>
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <h2 id="how-heading" className="text-h2 font-semibold tracking-[-0.01em] text-p-ink sm:text-h2lg">
              How it works
            </h2>
            <p className="mt-2 text-body text-p-ink-2">
              Three steps for one file or forty. Batches share one setting, and any file can
              override it.
            </p>
          </div>
          <div className="mt-10">
            <HowItWorks />
          </div>
        </section>
      </main>
    </>
  );
}
