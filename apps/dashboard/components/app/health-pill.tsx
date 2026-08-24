import { cn } from '@/lib/utils';

interface HealthPillProps {
  lastHealth: Record<string, unknown> | null;
}

/** Values swap instantly on poll (DESIGN.md §7: Health) — no animated counters. */
export function HealthPill({ lastHealth }: HealthPillProps) {
  if (!lastHealth) {
    return <span className="font-mono text-xs text-muted-foreground">not checked</span>;
  }

  const status = typeof lastHealth.status === 'string' ? lastHealth.status : typeof lastHealth.error === 'string' ? 'down' : 'unknown';
  const healthy = status === 'ok' || status === 'healthy';
  const down = status === 'down' || status === 'error';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs tracking-wide',
        healthy && 'text-success',
        down && 'text-destructive',
        !healthy && !down && 'text-warning',
      )}
    >
      <span aria-hidden>●</span>
      {status}
    </span>
  );
}
