import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IconTileProps {
  icon: LucideIcon;
  size?: 'sm' | 'md';
  className?: string;
}

/** A Lucide glyph set in a tinted square so it reads as a mark, not a bullet. */
export function IconTile({ icon: Icon, size = 'md', className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-card bg-violet-12 text-violet',
        size === 'md' ? 'h-7 w-7' : 'h-6 w-6',
        className,
      )}
    >
      <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={1.75} />
    </span>
  );
}
