'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { HelixApiError, type PdfAssessResponse } from '@/lib/api';
import { runPdfAssess } from '@/lib/checks';
import { PillButton } from '@/components/shared/pill-button';
import {
  CheckPanel,
  ErrorNote,
  FieldLabel,
  KeyNote,
  ResultRow,
  RunLabel,
  Verdict,
  inputClass,
  needsKey,
  useCheckKey,
} from './check-shell';

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfCheck() {
  const { apiKey, ready } = useCheckKey();
  const [url, setUrl] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<PdfAssessResponse | null>(null);

  const blocked = needsKey(apiKey) && ready;

  /** The route rejects non-PDFs server-side; filtering here saves the round trip. */
  function acceptFile(candidate: File | null | undefined) {
    if (!candidate) return;
    const isPdf = candidate.type === 'application/pdf' || candidate.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('That is not a PDF. This check only reads PDFs.');
      return;
    }
    setError(null);
    setFile(candidate);
    setUrl('');
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file && !url.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let response: PdfAssessResponse;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        response = await runPdfAssess(form, apiKey);
      } else {
        response = await runPdfAssess({ url: url.trim() }, apiKey);
      }
      setResult(response);
    } catch (err) {
      setError(err instanceof HelixApiError ? err.message : 'That check could not run.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose font-sans text-[15px] leading-relaxed text-m-ink/72">
        Whether a PDF needs OCR, without converting it. This runs the same classifier{' '}
        <code className="font-mono text-[13px]">/parse</code> runs before it picks a parser, so you can decide whether a
        full parse is worth paying for before spending it.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="pdf-url">PDF URL</FieldLabel>
          <input
            id="pdf-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setFile(null);
            }}
            placeholder="https://example.com/report.pdf"
            className={inputClass}
            disabled={file !== null}
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'rounded-card border border-dashed px-5 py-6 text-center transition-colors duration-150 ease-out',
            dragging ? 'border-violet bg-violet/[0.04]' : 'border-m-border-muted',
          )}
        >
          {file ? (
            <p className="font-mono text-[13px] text-m-ink">
              {file.name}{' '}
              <button
                type="button"
                onClick={() => setFile(null)}
                className="ml-2 text-m-ink/56 underline underline-offset-2 hover:text-m-ink"
              >
                remove
              </button>
            </p>
          ) : (
            <p className="font-mono text-[12px] text-m-ink/56">
              or drop a PDF here —{' '}
              <label className="cursor-pointer text-violet underline underline-offset-2">
                browse
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
              </label>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PillButton type="submit" variant="primary" disabled={busy || blocked || (!file && !url.trim())}>
            <RunLabel busy={busy}>Assess</RunLabel>
          </PillButton>
          {blocked && <KeyNote />}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>

      {result?.success === false && (
        <CheckPanel>
          <Verdict tone="bad" headline="Could not assess" detail={result.failure.detail ?? result.failure.reason} />
        </CheckPanel>
      )}

      {result?.success && (
        <CheckPanel>
          <Verdict
            tone={result.data.needsOcr ? 'warn' : 'good'}
            headline={result.data.needsOcr ? 'Needs OCR' : 'Has a text layer'}
            detail={result.data.reason}
          />
          <ResultRow label="Pages">{result.data.pageCount}</ResultRow>
          <ResultRow label="Characters">{result.data.charsExtracted.toLocaleString()}</ResultRow>
          <ResultRow label="Garbled text">{result.data.suspectedGarbledText ? 'suspected' : 'no'}</ResultRow>
          <ResultRow label="Size">{formatBytes(result.data.metadata.sizeBytes)}</ResultRow>
        </CheckPanel>
      )}
    </div>
  );
}
