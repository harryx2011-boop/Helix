'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { KIND_LABELS, KIND_ORDER, label, pairsByKind, type FormatKind, type FormatPair } from '@/lib/formats';
import { prefersReducedMotion } from '@/lib/theme';

function Tile({ pair, index, shown }: { pair: FormatPair; index: number; shown: boolean }) {
  const isCompress = pair.op === 'compress';
  return (
    <li
      style={{ animationDelay: `${Math.min(index, 11) * 50}ms` }}
      className={shown ? 'animate-fade-up' : 'opacity-0'}
    >
      <Link
        href={`/convert/${pair.slug}`}
        className="flex h-full min-h-[44px] flex-col gap-1 rounded-card border border-p-line bg-p-surface px-4 py-3 transition-[transform,border-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-p-line-2 hover:shadow-card-sm active:scale-[0.98]"
      >
        <span className="flex items-center gap-1.5 text-[14px] font-medium text-p-ink">
          {isCompress ? (
            pair.title
          ) : (
            <>
              <span className="font-mono">{label(pair.from)}</span>
              <ArrowRight className="h-3.5 w-3.5 text-p-ink-3" aria-hidden="true" />
              <span className="font-mono">{label(pair.to)}</span>
            </>
          )}
        </span>
        <span className="line-clamp-2 text-[12px] leading-snug text-p-ink-3">{pair.description}</span>
      </Link>
    </li>
  );
}

function Group({ kind, limit }: { kind: FormatKind; limit: number | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const all = pairsByKind(kind);
  const items = limit ? all.slice(0, limit) : all;
  const remaining = all.length - items.length;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '-40px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} id={kind} className="scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="flex items-baseline gap-2 text-[17px] font-semibold text-p-ink">
          {KIND_LABELS[kind]}
          <span className="font-mono text-[12px] font-medium text-p-ink-3">{all.length}</span>
        </h3>
        {remaining > 0 && (
          <Link
            href={`/tools#${kind}`}
            className="inline-flex h-11 items-center gap-1 text-[13px] font-medium text-p-ink-2 transition-colors duration-150 ease-out hover:text-p-ink"
          >
            All {all.length} {KIND_LABELS[kind].toLowerCase()} tools
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((p, i) => (
          <Tile key={p.slug} pair={p} index={i} shown={shown} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Every manifest entry as a tile, grouped Video / Audio / Image / GIF. Tiles
 * fade up 50ms apart the first time their group scrolls into view; reduced
 * motion shows them immediately.
 */
export function FormatGrid({ limit, kinds = KIND_ORDER }: { limit?: number; kinds?: FormatKind[] }) {
  return (
    <div className="space-y-12">
      {kinds.map((kind) => (
        <Group key={kind} kind={kind} limit={limit} />
      ))}
    </div>
  );
}
