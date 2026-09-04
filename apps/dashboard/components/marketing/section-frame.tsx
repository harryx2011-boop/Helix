import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeRain, PixelSquares } from './ambient';

/**
 * Firecrawl-style page frame: two vertical hairlines run the full page height,
 * mounted once in `(marketing)/layout.tsx` around every section. `FrameBand`
 * draws the between-section band, bleeding its horizontal hairlines out to
 * the viewport edge since the column itself has no horizontal hairline.
 */
export function FrameColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto max-w-container overflow-x-hidden border-x-0 sm:border-x sm:border-m-border-faint">
      {children}
    </div>
  );
}

export interface FrameBandProps {
  step?: string;
  total?: string;
  label: string;
  sub: string;
  icon?: LucideIcon;
  className?: string;
}

/** `[ 01 / 05 ] · LABEL // sub //` band between sections, split at ~45% by a hairline. */
export function FrameBand({ step, total, label, sub, icon: Icon, className }: FrameBandProps) {
  return (
    <div className={cn('relative flex h-16 items-stretch border-y border-m-border-faint', className)}>
      <span aria-hidden className="absolute -left-[100vw] -right-[100vw] top-0 h-px bg-m-border-faint" />
      <span aria-hidden className="absolute -left-[100vw] -right-[100vw] bottom-0 h-px bg-m-border-faint" />
      <span aria-hidden className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-violet" />

      <div className="flex w-full min-w-0 items-center gap-2.5 pl-6 pr-4 lg:w-[45%] lg:border-r lg:border-m-border-faint">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-violet" strokeWidth={1.75} aria-hidden />}
        <p className="truncate font-mono text-[12px] uppercase tracking-wide text-m-ink/48">
          {step && total ? (
            <>
              [ <span className="text-violet">{step}</span> / {total} ] ·{' '}
            </>
          ) : null}
          {label} <span className="text-m-ink/48">{'// '}{sub}{' //'}</span>
        </p>
      </div>

      <div className="relative hidden flex-1 items-center overflow-hidden px-6 lg:flex lg:px-8">
        <CodeRain cols={18} rows={2} density={0.45} seed={(step ? step.charCodeAt(0) : 5) * 13 + 3} />
        <PixelSquares
          size={4}
          scale="md"
          accent
          mode="assemble"
          seed={(step ? step.charCodeAt(1) ?? 1 : 1) * 17 + 2}
          className="ml-auto grid"
        />
      </div>
    </div>
  );
}
