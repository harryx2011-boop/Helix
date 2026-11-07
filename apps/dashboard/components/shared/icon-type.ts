import type { LucideIcon } from '@/components/icons/lucide';

export type GlyphIcon = LucideIcon | ((props: { className?: string; strokeWidth?: number }) => React.JSX.Element);
