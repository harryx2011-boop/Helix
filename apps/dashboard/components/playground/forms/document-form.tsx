'use client';

import * as React from 'react';
import type { DocumentOp, DocumentRequest } from '@/lib/api';
import { FormFooter } from './form-footer';
import { cn } from '@/lib/utils';

/**
 * The dispatcher's operations, in the order a caller usually wants them.
 * `scrub` is deliberately absent: it answers with file bytes rather than JSON,
 * and the Metadata tab already handles that response properly.
 */
const OPS: readonly { id: Exclude<DocumentOp, 'scrub'>; label: string; hint: string }[] = [
  { id: 'parse', label: 'Parse', hint: 'The document as markdown, or as JSON against a schema.' },
  { id: 'metadata', label: 'Metadata', hint: 'What the file discloses about who and what made it.' },
  { id: 'assess', label: 'Assess', hint: 'Text-layer quality, before you spend on OCR.' },
];

const OCR_MODES = ['auto', 'force', 'off'] as const;

interface DocumentFormProps {
  url: string;
  onSubmit: (request: DocumentRequest) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function DocumentForm({ url, onSubmit, onGetCode, loading }: DocumentFormProps) {
  const [op, setOp] = React.useState<Exclude<DocumentOp, 'scrub'>>('parse');
  const [ocr, setOcr] = React.useState<(typeof OCR_MODES)[number]>('auto');

  const canSubmit = url.trim().length > 0;

  const buildBody = React.useCallback((): DocumentRequest => {
    const body: DocumentRequest = { op, url: url.trim() };

    if (op === 'parse') {
      body.formats = ['markdown'];
      body.ocr = ocr;
    }

    return body;
  }, [op, url, ocr]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    onSubmit(buildBody());
  };

  const activeHint = OPS.find((entry) => entry.id === op)?.hint;

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <p className="text-xs text-muted-foreground">
        Reads the document URL from the prompt box above. To upload a file, use the Parse or Metadata
        tab — those take a file directly.
      </p>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Operation</legend>
        <div className="grid grid-cols-3 gap-2">
          {OPS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={op === entry.id}
              onClick={() => setOp(entry.id)}
              className={cn(
                'rounded-card border px-3 py-2 text-sm font-medium transition-colors duration-fast',
                op === entry.id
                  ? 'border-violet bg-violet-8 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {activeHint && <p className="text-xs leading-relaxed text-muted-foreground">{activeHint}</p>}
      </fieldset>

      {op === 'parse' && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">OCR</legend>
          <div className="grid grid-cols-3 gap-2">
            {OCR_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={ocr === mode}
                onClick={() => setOcr(mode)}
                className={cn(
                  'rounded-card border px-3 py-2 text-sm font-medium transition-colors duration-fast',
                  ocr === mode
                    ? 'border-violet bg-violet-8 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <code>auto</code> runs OCR only when the text layer is missing or garbled.
          </p>
        </fieldset>
      )}

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildBody() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
