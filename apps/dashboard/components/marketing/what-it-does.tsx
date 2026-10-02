import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { FEATURES } from '@/lib/feature-copy';
import { cn } from '@/lib/utils';
import { FrameBand } from './section-frame';
import { IconTile } from './icon-tile';
import { AsciiNoise } from '@/components/shared/ascii-fields';

const CARDS = FEATURES.filter((f) => f.home);

/** Home §1: six things Helix does, each a plain sentence and a link to its page. */
export function WhatItDoes() {
  return (
    <section className="px-6 py-16 sm:px-10">
      <FrameBand step="01" icon={Sparkles} />

      <div className="py-16">
        <div data-reveal className="relative mx-auto max-w-[640px] px-6 py-6 text-center">
          <AsciiNoise
            cols={120}
            rows={18}
            seed={41}
            className="absolute -inset-x-24 -inset-y-10 hidden overflow-hidden opacity-80 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_40%,black_68%,transparent_100%)]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-[560px] text-[28px] font-normal leading-[1.1] tracking-tighter sm:text-[36px]">
              Six things Helix does <span className="text-violet">for you.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[16px] leading-relaxed text-m-ink/72">
              Point it at a page, a file or a question. Pick the one that fits.
            </p>
          </div>
        </div>

        <div
          data-reveal-group
          className="mt-10 grid grid-cols-1 overflow-hidden rounded-panel border border-m-border-muted bg-m-surface shadow-card-sm sm:grid-cols-2 lg:grid-cols-3"
        >
          {CARDS.map((f) => (
            <Link
              key={f.id}
              href={f.route}
              data-reveal-item
              className={cn(
                'group flex min-w-0 flex-col items-start border-b border-m-border-faint px-6 py-8 transition-colors duration-200 ease-out hover:bg-m-ink/[0.031]',
                'focus-visible:bg-m-ink/[0.031] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet/40',
                'last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0',
              )}
            >
              <IconTile icon={f.icon} size="lg" />
              <span className="mt-4 text-[17px] font-medium leading-tight tracking-tight text-m-ink">{f.name}</span>
              <span className="mt-2 text-[14px] leading-relaxed text-m-ink/64">{f.blurb}</span>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-violet transition-colors duration-150 ease-out group-hover:text-violet-hover">
                Learn more
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
