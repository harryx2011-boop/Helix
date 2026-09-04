import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ApiQuickstart } from '@/components/marketing/api-quickstart';
import { KIND_LABELS, compressors } from '@/lib/formats';

export const metadata: Metadata = {
  title: 'Compress · Converter API',
  description:
    'Shrink video, MP3, WAV, JPEG, PNG and other images to a target size or a preset. Live size estimate before you run it.',
};

const PRESETS = [
  { name: 'Email', target: '25 MB', note: 'Fits the common attachment cap.' },
  { name: 'Discord', target: '10 MB', note: 'Under the free-tier upload limit.' },
  { name: 'Web', target: 'CRF 28', note: 'Small enough to embed, still sharp at 1080p.' },
  { name: 'Archive', target: 'CRF 20', note: 'Keeps detail; roughly halves most camera footage.' },
];

export default function CompressPage() {
  const items = compressors();
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <h1 className="text-h1 font-semibold tracking-[-0.02em] text-p-ink sm:text-h1lg">Compress</h1>
          <p className="mt-2 text-body leading-relaxed text-p-ink-2">
            Six compressors. Pick a preset or type a target size, and the estimate updates before
            you start. Video and audio go through ffmpeg; images go through libvips. Same file
            limit as everything else: 5 GB.
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/convert/${p.slug}`}
                className="flex h-full flex-col gap-1 rounded-card border border-p-line bg-p-surface px-4 py-3 transition-[transform,border-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-p-line-2 hover:shadow-card-sm active:scale-[0.98]"
              >
                <span className="flex items-center justify-between gap-2 text-body font-medium text-p-ink">
                  {p.title}
                  <ArrowRight className="h-4 w-4 text-p-ink-3" aria-hidden="true" />
                </span>
                <span className="text-note leading-snug text-p-ink-2">{p.description}</span>
                <span className="mt-1 font-mono text-micro text-p-ink-3">{KIND_LABELS[p.kind]}</span>
              </Link>
            </li>
          ))}
        </ul>

        <section aria-labelledby="presets-heading" className="mt-16">
          <h2 id="presets-heading" className="text-h3 font-semibold tracking-[-0.01em] text-p-ink">
            Video presets
          </h2>
          <p className="mt-2 max-w-[56ch] text-body text-p-ink-2">
            Presets set the target; the target-size field overrides them. Both feed the same
            estimate. Presets you save yourself appear beside these.
          </p>
          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRESETS.map((p) => (
              <div key={p.name} className="rounded-card border border-p-line bg-p-surface px-4 py-3">
                <dt className="flex items-baseline justify-between gap-2 text-sm font-medium text-p-ink">
                  {p.name}
                  <span className="font-mono text-caption text-p-ink-3">{p.target}</span>
                </dt>
                <dd className="mt-1 text-note text-p-ink-2">{p.note}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="compress-api-heading" className="mt-16">
          <h2 id="compress-api-heading" className="text-h3 font-semibold tracking-[-0.01em] text-p-ink">
            Compress from code
          </h2>
          <p className="mt-2 max-w-[56ch] text-body text-p-ink-2">
            One field picks the preset, or send <span className="font-mono">target</span> in bytes.
          </p>
          <div className="mt-6">
            <ApiQuickstart op="compress" />
          </div>
        </section>
      </main>
    </>
  );
}
