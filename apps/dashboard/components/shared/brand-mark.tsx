import { BRAND_MARKS, type BrandId } from '@/lib/brand-marks';
import { cn } from '@/lib/utils';

/** A platform's or client's real mark. `mono` forces currentColor, e.g. white on the violet button. */
export function BrandMark({ id, mono, className }: { id: BrandId; mono?: boolean; className?: string }) {
  const mark: { src: string; mono?: boolean } = BRAND_MARKS[id];
  if (mono ?? mark.mono) {
    return (
      <span
        aria-hidden
        className={cn('inline-block h-4 w-4 shrink-0 bg-current', className)}
        style={{
          maskImage: `url(${mark.src})`,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: `url(${mark.src})`,
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static mark, no next/image benefit
    <img src={mark.src} alt="" width={16} height={16} className={cn('inline-block h-4 w-4 shrink-0 rounded-[3px] object-contain', className)} />
  );
}
