'use client';

import * as React from 'react';
import { Check, ChevronDown, Copy, Pencil } from '@/components/icons/lucide';
import { Button } from '@/components/ui/button';
import { SchemaJson } from './schema-json';
import { cn } from '@/lib/utils';

export function SchemaPanel({
  schema,
  onApplyEdit,
  className,
}: {
  schema: Record<string, unknown>;
  onApplyEdit: (next: Record<string, unknown>) => void;
  className?: string;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const startEdit = () => {
    setDraft(JSON.stringify(schema, null, 2));
    setEditError(null);
    setEditing(true);
    setCollapsed(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  const applyEdit = () => {
    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>;
      onApplyEdit(parsed);
      setEditing(false);
      setEditError(null);
    } catch {
      setEditError('Not valid JSON.');
    }
  };

  const copySchema = () => {
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  };

  return (
    <div className={cn('rounded-panel border border-border bg-card', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
          aria-expanded={!collapsed}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ease-out', collapsed && '-rotate-90')} />
          Schema
        </button>
        <div className="flex items-center gap-1">
          {!editing && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-card" onClick={startEdit} aria-label="Edit schema">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-card" onClick={copySchema} aria-label="Copy schema">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-card"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand schema' : 'Collapse schema'}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150 ease-out', !collapsed && 'rotate-180')} />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="p-4">
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={12}
                spellCheck={false}
                className="w-full resize-y rounded-card border border-border bg-secondary/40 p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus-visible:border-primary"
              />
              {editError && <p className="text-xs text-destructive">{editError}</p>}
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" className="rounded-pill" onClick={applyEdit}>
                  Apply
                </Button>
                <Button type="button" variant="ghost" size="sm" className="rounded-pill" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <SchemaJson value={schema} className="overflow-x-auto font-mono text-[13px] leading-relaxed" />
          )}
        </div>
      )}
    </div>
  );
}
