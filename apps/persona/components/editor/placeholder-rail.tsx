'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlaceholderMeta } from '@/lib/placeholders';

/** Right rail: remaining placeholders in a fork, with a Fill button that opens the wizard for it. */
export function PlaceholderRail({
  remaining,
  total,
  onFill,
}: {
  remaining: PlaceholderMeta[];
  total: number;
  onFill: () => void;
}) {
  if (total === 0) return null;

  return (
    <aside className="w-64 shrink-0 border-l border-p-line bg-p-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-p-ink">Placeholders</h2>
        <span className="font-mono text-xs text-p-ink-3">
          {total - remaining.length}/{total}
        </span>
      </div>

      {remaining.length === 0 ? (
        <p className="text-sm leading-relaxed text-p-ink-2">All placeholders are filled.</p>
      ) : (
        <>
          <ul className="mb-4 space-y-2">
            {remaining.map((p) => (
              <li key={p.key} className="rounded-card border border-p-line bg-p-bg px-3 py-2">
                <span className="prose-persona">
                  <span className="placeholder">{p.key}</span>
                </span>
                <p className="mt-1 text-xs leading-relaxed text-p-ink-2">{p.label}</p>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            onClick={onFill}
            className="h-8 w-full rounded-pill bg-p-ink text-sm text-p-bg hover:bg-p-ink/90"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Fill remaining
          </Button>
        </>
      )}
    </aside>
  );
}
