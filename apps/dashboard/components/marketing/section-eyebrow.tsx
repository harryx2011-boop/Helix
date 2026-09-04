import { cn } from '@/lib/utils';

/** `[ 01 / 05 ] · LABEL // Sub //` mono eyebrow. Sits under a heading, never above one. */
export function SectionEyebrow({ step, label, sub, className }: { step: string; label: string; sub: string; className?: string }) {
  return (
    <p className={cn('font-mono text-[12px] uppercase tracking-wide text-m-ink/48', className)}>
      [ {step} ] · {label} <span className="text-m-ink/48">{'// '}{sub}{' //'}</span>
    </p>
  );
}
