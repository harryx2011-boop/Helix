import Link from 'next/link';
import { FORMAT_PAIRS, compressors } from '@/lib/formats';

const LINKS = [
  { href: '/convert', label: 'Convert' },
  { href: '/compress', label: 'Compress' },
  { href: '/tools', label: 'Tools' },
  { href: '/api-docs', label: 'API' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
] as const;

/** Bottom of every page: wordmark, the same five links, Helix credit, retention line. */
export function SiteFooter() {
  const converterCount = FORMAT_PAIRS.length - compressors().length;
  return (
    <footer className="border-t border-p-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-sm">
          <p className="text-[15px] font-semibold text-p-ink">Converter API</p>
          <p className="mt-1 text-[13px] leading-relaxed text-p-ink-3">
            {converterCount} converters and {compressors().length} compressors over ffmpeg and libvips. Files up
            to 5 GB. Output is deleted one hour after the job finishes.
          </p>
          <a
            href="https://helixapi-dev.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-11 items-center text-[13px] text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink"
          >
            Part of Helix
          </a>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-1 gap-y-0 sm:justify-end">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex h-11 items-center rounded-pill px-3 text-[14px] text-p-ink-2 transition-colors duration-150 ease-out hover:bg-p-code hover:text-p-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
