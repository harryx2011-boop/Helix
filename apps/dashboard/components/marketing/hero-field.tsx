import { cn } from '@/lib/utils';
import { AsciiFluid } from './ascii-fluid';
import { AsciiFlow, AsciiNoise, AsciiOrbit, AsciiSegments } from './ascii-fields';
import type { FieldTone } from './field-tone';

export type HeroMotif = 'cloud' | 'wave' | 'flow' | 'orbit' | 'segments';

export interface HeroFieldProps {
  motif: HeroMotif;
  seed?: number;
  tone?: FieldTone;
  className?: string;
}

/**
 * One of the four character fields in its standard hero placement. Mount
 * inside a `relative` wrapper and keep the content `relative` so it paints
 * above. `cloud` is a ring around the centred title, `wave` flanks it at the
 * sides, `flow` sits behind it with the centre cleared, `orbit` hangs at the
 * right edge. Every placement is hidden on small screens.
 */
export function HeroField({ motif, seed = 3, tone = 'marketing', className }: HeroFieldProps) {
  switch (motif) {
    case 'cloud':
      return (
        <AsciiNoise
          cols={150}
          rows={22}
          seed={seed}
          tone={tone}
          className={cn(
            'absolute left-1/2 top-0 hidden -translate-x-1/2 opacity-50 md:block [mask-image:radial-gradient(ellipse_at_center,transparent_26%,black_52%,transparent_78%)]',
            className,
          )}
        />
      );
    case 'wave':
      return (
        <>
          <AsciiFluid
            cols={30}
            rows={12}
            seed={seed}
            tone={tone}
            className={cn('absolute left-0 top-1/2 hidden -translate-y-1/2 lg:block [mask-image:linear-gradient(to_right,black_70%,transparent)]', className)}
          />
          <AsciiFluid
            cols={30}
            rows={12}
            seed={seed + 12}
            tone={tone}
            className={cn('absolute right-0 top-1/2 hidden -translate-y-1/2 lg:block [mask-image:linear-gradient(to_left,black_70%,transparent)]', className)}
          />
        </>
      );
    case 'flow':
      return (
        <AsciiFlow
          cols={140}
          rows={18}
          seed={seed}
          tone={tone}
          className={cn(
            'absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 overflow-hidden opacity-80 sm:block [mask-image:radial-gradient(ellipse_at_center,transparent_36%,black_64%,transparent_100%)]',
            className,
          )}
        />
      );
    case 'orbit':
      return (
        <AsciiOrbit
          cols={44}
          rows={17}
          seed={seed}
          tone={tone}
          className={cn('absolute -top-4 right-0 hidden lg:block [mask-image:linear-gradient(to_right,transparent,black_30%,black_85%,transparent)]', className)}
        />
      );
    case 'segments':
      return (
        <AsciiSegments
          cols={120}
          rows={19}
          seed={seed}
          tone={tone}
          className={cn(
            'absolute left-1/2 top-0 hidden -translate-x-1/2 opacity-70 md:block [mask-image:radial-gradient(ellipse_at_center,transparent_30%,black_58%,transparent_82%)]',
            className,
          )}
        />
      );
  }
}
