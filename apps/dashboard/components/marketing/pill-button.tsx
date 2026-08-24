import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PillButtonProps {
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}

/**
 * Primary: violet fill, white text, shadow-btn -> shadow-btn-hover on hover.
 * Secondary: ink-alpha wash, 3.9% -> 5.9% on hover. No transform on either (WEBSITE.md §3.1).
 */
export function PillButton({ href, onClick, variant = 'primary', children, className, disabled, type = 'button' }: PillButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2.5 font-sans text-[14px] font-medium tracking-normal transition-shadow duration-200 ease-out',
    variant === 'primary' && 'bg-violet text-white shadow-btn hover:shadow-btn-hover',
    variant === 'secondary' && 'bg-m-ink/[0.039] text-m-ink hover:bg-m-ink/[0.059]',
    disabled && 'pointer-events-none opacity-48',
    className,
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
