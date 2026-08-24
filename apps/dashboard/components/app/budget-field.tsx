'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface BudgetFieldProps {
  initialBudgetUsd: number | null;
}

/** Month-to-date budget input. PATCHes /api/app/profile `{ monthly_budget_usd }` — same route another agent owns. */
export function BudgetField({ initialBudgetUsd }: BudgetFieldProps) {
  const [value, setValue] = React.useState(initialBudgetUsd !== null ? String(initialBudgetUsd) : '');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSave = React.useCallback(async () => {
    const parsed = value.trim() === '' ? null : Number(value);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;

    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/app/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ monthly_budget_usd: parsed }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm text-muted-foreground">$</span>
      <Input
        type="number"
        min={0}
        step="1"
        inputMode="decimal"
        placeholder="No budget set"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className="h-8 w-28 font-mono text-sm"
      />
      <Button size="sm" variant="secondary" className="h-8" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? 'Saved' : 'Save'}
      </Button>
    </div>
  );
}
