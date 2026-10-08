'use client';

import * as React from 'react';
import { Plus, X } from '@/components/icons/lucide';
import type { ExtractRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormFooter } from './form-footer';
import { cn } from '@/lib/utils';

/** Matches crawl-form's textarea: there is no ui/textarea component. */
const TEXTAREA_CLASS =
  'flex w-full rounded-card border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const MAX_URLS = 25;

type Mode = 'prompt' | 'schema';

interface ExtractFormProps {
  url: string;
  onSubmit: (request: ExtractRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function ExtractForm({ url, onSubmit, onGetCode, loading }: ExtractFormProps) {
  const [mode, setMode] = React.useState<Mode>('prompt');
  const [prompt, setPrompt] = React.useState('');
  const [schemaText, setSchemaText] = React.useState('');
  const [extraUrls, setExtraUrls] = React.useState<string[]>([]);
  const [allowUngrounded, setAllowUngrounded] = React.useState(false);

  const urls = React.useMemo(
    () => [url.trim(), ...extraUrls.map((u) => u.trim())].filter(Boolean),
    [url, extraUrls],
  );

  const schemaError = React.useMemo(() => {
    if (mode !== 'schema' || !schemaText.trim()) return undefined;
    try {
      JSON.parse(schemaText);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : 'Not valid JSON';
    }
  }, [mode, schemaText]);

  const canSubmit =
    urls.length > 0 &&
    urls.length <= MAX_URLS &&
    (mode === 'prompt' ? prompt.trim().length > 0 : schemaText.trim().length > 0 && !schemaError);

  const buildBody = React.useCallback((): ExtractRequest => {
    const body: ExtractRequest = { urls };
    if (mode === 'prompt') body.prompt = prompt.trim();
    else body.schema = JSON.parse(schemaText) as Record<string, unknown>;
    if (allowUngrounded) body.allowUngrounded = true;
    return body;
  }, [urls, mode, prompt, schemaText, allowUngrounded]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    onSubmit(buildBody());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <p className="text-xs text-muted-foreground">
        The URL above is the first row. Add more to apply the same shape across all of them.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">
          Extra URLs <span className="font-normal text-muted-foreground">({urls.length}/{MAX_URLS})</span>
        </legend>
        {extraUrls.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={value}
              placeholder="https://example.com/another"
              onChange={(event) =>
                setExtraUrls((rows) => rows.map((row, i) => (i === index ? event.target.value : row)))
              }
            />
            <button
              type="button"
              aria-label={`Remove URL ${index + 2}`}
              onClick={() => setExtraUrls((rows) => rows.filter((_, i) => i !== index))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-border text-muted-foreground transition-colors duration-fast hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={urls.length >= MAX_URLS}
          onClick={() => setExtraUrls((rows) => [...rows, ''])}
          className="flex items-center justify-center gap-1.5 rounded-card border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors duration-fast hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add URL
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Describe the shape</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['prompt', 'In words'],
              ['schema', 'JSON Schema'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'rounded-card border px-3 py-2 text-sm font-medium transition-colors duration-fast',
                mode === value
                  ? 'border-violet bg-violet-8 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {mode === 'prompt' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="extract-prompt">What do you want from each page?</Label>
          <textarea
            id="extract-prompt"
            rows={4}
            value={prompt}
            placeholder="every plan name and its monthly price"
            onChange={(event) => setPrompt(event.target.value)}
            className={TEXTAREA_CLASS}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="extract-schema">JSON Schema</Label>
          <textarea
            id="extract-schema"
            rows={8}
            spellCheck={false}
            value={schemaText}
            placeholder={'{\n  "type": "object",\n  "properties": {\n    "plan": { "type": "string" }\n  }\n}'}
            onChange={(event) => setSchemaText(event.target.value)}
            className={cn(TEXTAREA_CLASS, 'font-mono text-xs')}
          />
          {schemaError && <p className="text-xs text-destructive">{schemaError}</p>}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={allowUngrounded}
          onChange={(event) => setAllowUngrounded(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-violet"
        />
        <span className="flex flex-col gap-0.5">
          Keep ungrounded fields
          <span className="text-xs leading-relaxed text-muted-foreground">
            By default a field with no matching span in the page is dropped and listed instead of
            returned. Tick this to keep those values — they are still reported either way.
          </span>
        </span>
      </label>

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildBody() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
