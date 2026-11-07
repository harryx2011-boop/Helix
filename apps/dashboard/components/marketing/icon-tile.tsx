import { cn } from '@/lib/utils';
import type { GlyphIcon } from '@/components/shared/icon-type';

export interface IconTileProps {
  icon: GlyphIcon;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TILE_CLASS: Record<NonNullable<IconTileProps['size']>, string> = { sm: 'h-6 w-6', md: 'h-7 w-7', lg: 'h-10 w-10' };
const GLYPH_CLASS: Record<NonNullable<IconTileProps['size']>, string> = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-5 w-5' };

export function IconTile({ icon: Icon, size = 'md', className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center rounded-card bg-violet-12 text-violet', TILE_CLASS[size], className)}
    >
      <Icon className={GLYPH_CLASS[size]} strokeWidth={1.75} />
    </span>
  );
}
