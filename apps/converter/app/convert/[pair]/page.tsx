import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { ConverterPanel } from '@/components/converter/converter-panel';
import { ENDPOINTS, FORMAT_PAIRS, KIND_LABELS, findPair, label, relatedPairs } from '@/lib/formats';

type Params = { pair: string };

export function generateStaticParams(): Params[] {
  return FORMAT_PAIRS.map((p) => ({ pair: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { pair } = await params;
  const entry = findPair(pair);
  if (!entry) return {};
  return {
    title: `${entry.title} · Converter API`,
    description: entry.description,
  };
}

export default async function PairPage({ params }: { params: Promise<Params> }) {
  const { pair } = await params;
  const entry = findPair(pair);
  if (!entry) notFound();

  const related = relatedPairs(entry);

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-[30px] font-semibold tracking-[-0.02em] text-p-ink sm:text-[40px]">
            {entry.title}
          </h1>
          <p className="mx-auto mt-3 max-w-[56ch] text-[15px] leading-relaxed text-p-ink-2">{entry.description}</p>
          <p className="mt-2 font-mono text-[12px] text-p-ink-3">
            {KIND_LABELS[entry.kind]} · POST {ENDPOINTS[entry.op]}
          </p>
        </div>

        <div className="mt-10">
          <ConverterPanel preset={entry} />
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-16">
            <h2 id="related-heading" className="text-[17px] font-semibold text-p-ink">
              Nearby tools
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/convert/${p.slug}`}
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded-card border border-p-line bg-p-surface px-4 py-3 text-[14px] font-medium text-p-ink transition-[transform,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-p-line-2 active:scale-[0.98]"
                  >
                    <span className="font-mono">
                      {p.op === 'compress' ? p.title : `${label(p.from)} → ${label(p.to)}`}
                    </span>
                    <ArrowRight className="h-4 w-4 text-p-ink-3" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
