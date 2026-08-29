import { cn } from '@/lib/utils';
import type { RunStatus } from '@/lib/endpoints';

const STATUS_LABEL: Record<RunStatus, string> = {
  success: 'SUCCESS',
  failure: 'FAILURE',
  running: 'RUNNING',
  cancelled: 'CANCELLED',
};

const STATUS_CLASS: Record<RunStatus, string> = {
  success: 'text-success',
  failure: 'text-destructive',
  running: 'text-primary',
  cancelled: 'text-muted-foreground',
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={cn('font-mono text-xs tracking-wide', STATUS_CLASS[status])}>
      [ {STATUS_LABEL[status]} ]
    </span>
  );
}
