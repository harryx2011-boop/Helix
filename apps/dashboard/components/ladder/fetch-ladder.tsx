import { Check, X } from '@/components/icons/lucide';
import { cn } from '@/lib/utils';
import type { Tier } from '@/lib/api';

const TIER_ORDER: Tier[] = ['plain', 'tls', 'lightpanda', 'chromium'];

const TIER_LABEL: Record<Tier, string> = {
  auto: 'auto',
  plain: 'plain',
  tls: 'tls',
  lightpanda: 'lightpanda',
  chromium: 'chromium',
};

interface FetchLadderProps {
  tiersAttempted: Tier[];
  /** The tier that produced the returned result, or undefined on total failure. */
  resolvedTier?: Tier | undefined;
}

/**
 * Renders every rung Helix walked, in ladder order — not just the attempted
 * set — so a caller sees both which tiers were tried and which were skipped
 * because escalation stopped early or was never needed.
 */
export function FetchLadder({ tiersAttempted, resolvedTier }: FetchLadderProps) {
  const attemptedSet = new Set(tiersAttempted);
  const highestAttempted = tiersAttempted.length > 0 ? tiersAttempted[tiersAttempted.length - 1] : undefined;
  const highestIndex = highestAttempted ? TIER_ORDER.indexOf(highestAttempted) : -1;

  return (
    <div className="flex items-center gap-1" role="list" aria-label="Fetch tier ladder">
      {TIER_ORDER.map((tier, index) => {
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
              {TIER_LABEL[tier]}
            </div>
            {index < TIER_ORDER.length - 1 && (
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
