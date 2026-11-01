import { Check, X } from '@/components/icons/lucide';
import { cn } from '@/lib/utils';
import type { ResultTier } from '@/lib/api';

/** Every rung in ladder order: v3's three, with the retired v2 rungs where they stood. */
const LADDER: ResultTier[] = ['plain', 'tls', 'lightpanda', 'chromium', 'camoufox', 'browser'];

/** Shown only when a result stored before v3 walked them. */
const RETIRED = new Set<ResultTier>(['lightpanda', 'chromium', 'camoufox']);

interface FetchLadderProps {
  tiersAttempted: ResultTier[];
  /** The tier that produced the returned result, or undefined on total failure. */
  resolvedTier?: ResultTier | undefined;
}

/**
 * Renders every rung Helix walked, in ladder order — not just the attempted
 * set — so a caller sees both which tiers were tried and which were skipped
 * because escalation stopped early or was never needed.
 */
export function FetchLadder({ tiersAttempted, resolvedTier }: FetchLadderProps) {
  const attemptedSet = new Set(tiersAttempted);
  const rungs = LADDER.filter((tier) => !RETIRED.has(tier) || attemptedSet.has(tier) || tier === resolvedTier);
  const highestAttempted = tiersAttempted.length > 0 ? tiersAttempted[tiersAttempted.length - 1] : undefined;
  const highestIndex = highestAttempted ? rungs.indexOf(highestAttempted) : -1;

  return (
    <div className="flex items-center gap-1" role="list" aria-label="Fetch tier ladder">
      {rungs.map((tier, index) => {
        const attempted = attemptedSet.has(tier);
        const resolved = tier === resolvedTier;
        const skipped = !attempted && index <= highestIndex;
        const reached = index <= highestIndex;

        return (
          <div key={tier} className="flex items-center gap-1" role="listitem">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-card border px-2 py-1 text-xs font-mono transition-colors duration-150 ease-out',
                resolved && 'border-success bg-success/10 text-success',
                attempted && !resolved && 'border-border bg-secondary text-foreground',
                skipped && 'border-border/50 text-muted-foreground/60 line-through',
                !reached && !attempted && 'border-border/30 text-muted-foreground/40',
              )}
            >
              {resolved && <Check className="h-3 w-3" />}
              {attempted && !resolved && <X className="h-3 w-3 opacity-50" />}
              {tier}
            </div>
            {index < rungs.length - 1 && (
              <span className="text-muted-foreground/40" aria-hidden>
                &rarr;
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
