import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PixelSquares, TokenRain } from './ambient';

/**
 * The framed column from the Helix landing in Persona's tokens: two hairlines
 * run the full page height, `FrameBand` divides sections with an ambient
 * strip, and `SectionHeader` carries the heading and its body. Palette stays
 * Persona's: ink hairlines, blue accent.
 */
export function FrameColumn({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('relative mx-auto max-w-6xl border-x-0 sm:border-x sm:border-p-line', className)}>{children}</div>;
}

/** A divider between sections: hairlines bleeding to the viewport edge, token rain and an assembling pixel cluster. */
export function FrameBand({ seed = 5, className }: { seed?: number; className?: string }) {
  return (
    <div className={cn('relative flex h-14 items-center overflow-hidden border-y border-p-line px-6', className)}>
      <span aria-hidden className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-blue" />
      <TokenRain cols={26} rows={2} density={0.4} seed={seed} className="hidden sm:block" />
      <PixelSquares size={4} seed={seed * 7 + 1} className="ml-auto" />
    </div>
  );
}

export function SectionHeader({
  title,
  body,
  className,
}: {
  title: React.ReactNode;
  body?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl px-6', className)}>
      <h2 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.015em] text-p-ink sm:text-[36px]" style={{ textWrap: 'balance' }}>
        {title}
      </h2>
      {body ? <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-p-ink-2 sm:text-[16px]">{body}</p> : null}
    </div>
  );
}

interface PillLinkProps {
  href: string;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}

/** Primary: ink fill, shadow deepens on hover. Secondary: ink wash. No lift on either, as on the Helix landing. */
export function PillLink({ href, variant = 'primary', children, className, external }: PillLinkProps) {
  const classes = cn(
    'inline-flex h-11 items-center justify-center gap-2 rounded-pill px-6 text-[14px] font-medium transition-[box-shadow,background-color] duration-200 ease-out',
    variant === 'primary' && 'bg-p-ink text-p-bg shadow-btn hover:shadow-btn-hover',
    variant === 'secondary' && 'bg-p-wash text-p-ink hover:bg-p-wash-hover',
    className,
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
