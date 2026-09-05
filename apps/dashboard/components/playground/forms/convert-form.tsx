'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import type { ConvertFormat, ConvertRequest } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormFooter } from './form-footer';
import { FileDropzone } from '../file-dropzone';
import { CONVERTER_URL } from '@/lib/mode';
import { cn } from '@/lib/utils';

const ACCEPT = '.pdf,.png,.jpg,.jpeg';

type SourceKind = 'pdf' | 'png' | 'jpg' | 'unknown';

function sourceKindOf(file: File | null): SourceKind {
  if (!file) return 'unknown';
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.png') || file.type === 'image/png') return 'png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg') || file.type === 'image/jpeg') return 'jpg';
  return 'unknown';
}

/** Mirrors apps/api's SUPPORTED_TARGETS. `unknown` (a URL source, or an unrecognised extension) offers both — the server is the source of truth and answers a typed `unsupported_type` failure otherwise. */
const TARGETS_FOR: Record<SourceKind, readonly ConvertFormat[]> = {
  pdf: ['png', 'jpeg'],
  png: ['jpeg'],
  jpg: ['png'],
  unknown: ['png', 'jpeg'],
};

interface ConvertFormProps {
  url: string;
  onSubmit: (request: ConvertRequest | FormData) => void;
  onGetCode: (body: Record<string, unknown>) => void;
  loading: boolean;
}

export function ConvertForm({ url, onSubmit, onGetCode, loading }: ConvertFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [to, setTo] = React.useState<ConvertFormat>('png');
  const [page, setPage] = React.useState('1');
  const [dpi, setDpi] = React.useState('144');

  const sourceKind = sourceKindOf(file);
  const targets = TARGETS_FOR[sourceKind];
  const isPdf = sourceKind === 'pdf' || (sourceKind === 'unknown' && url.trim().toLowerCase().endsWith('.pdf'));

  // A single-target source (png->jpeg, jpg->png) locks the picker rather than
  // showing a one-choice list with nothing to decide.
  React.useEffect(() => {
    if (!targets.includes(to)) setTo(targets[0] ?? 'png');
  }, [targets, to]);

  const canSubmit = url.trim().length > 0 || file !== null;

  const buildJsonBody = React.useCallback((): ConvertRequest => {
    const body: ConvertRequest = { url: url.trim(), to };
    if (isPdf) {
      const pageNum = Number.parseInt(page, 10);
      const dpiNum = Number.parseInt(dpi, 10);
      if (Number.isFinite(pageNum) && pageNum > 0) body.page = pageNum;
      if (Number.isFinite(dpiNum) && dpiNum > 0) body.dpi = dpiNum;
    }
    return body;
  }, [url, to, isPdf, page, dpi]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;

    if (file) {
      const body = buildJsonBody();
      const formData = new FormData();
      formData.set('file', file);
      formData.set('to', to);
      if (body.page !== undefined) formData.set('page', String(body.page));
      if (body.dpi !== undefined) formData.set('dpi', String(body.dpi));
      onSubmit(formData);
      return;
    }
    onSubmit(buildJsonBody());
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <p className="text-xs text-muted-foreground">
        {file ? 'A file is selected below; it takes priority over the URL in the prompt box.' : 'Reads the URL from the prompt box above, or upload a file instead.'}
      </p>

      <FileDropzone
        id="convert-file"
        accept={ACCEPT}
        file={file}
        onFileChange={setFile}
        idleHint="PDF, PNG or JPEG — or leave it empty to use the URL above."
      />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Convert to</legend>
        <div className={cn('grid gap-2', targets.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {targets.map((format) => (
            <button
              key={format}
              type="button"
              aria-pressed={to === format}
              onClick={() => setTo(format)}
              className={cn(
                'rounded-card border px-3 py-2 text-sm font-medium transition-colors duration-fast',
                to === format
                  ? 'border-violet bg-violet-8 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </fieldset>

      {isPdf && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convert-page">Page</Label>
            <Input
              id="convert-page"
              type="number"
              inputMode="numeric"
              min={1}
              value={page}
              onChange={(event) => setPage(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convert-dpi">DPI</Label>
            <Input
              id="convert-dpi"
              type="number"
              inputMode="numeric"
              min={36}
              max={600}
              value={dpi}
              onChange={(event) => setDpi(event.target.value)}
            />
          </div>
        </div>
      )}

      {CONVERTER_URL && (
        <a
          href={CONVERTER_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 rounded-card border border-border p-3 text-left transition-colors duration-fast hover:bg-secondary"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Need full media conversion?</span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              Video, audio, GIF and more formats convert locally in your browser at Converter — nothing leaves your device.
            </span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      )}

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildJsonBody() as unknown as Record<string, unknown>)}
      />
    </form>
  );
}
