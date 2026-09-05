'use client';

import * as React from 'react';
import type { MetadataRequest } from '@/lib/api';
import type { EndpointMode } from '@/lib/run-endpoint';
import { FormFooter } from './form-footer';
import { FileDropzone } from '../file-dropzone';
import { cn } from '@/lib/utils';

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg';

const MODES: { value: EndpointMode; label: string; hint: string }[] = [
  { value: 'scan', label: 'Scan', hint: 'Report what the file discloses. Nothing is changed.' },
  { value: 'scrub', label: 'Scrub', hint: 'Return a copy with the metadata removed, plus a report of what came out.' },
];

interface MetadataFormProps {
  url: string;
  onSubmit: (request: MetadataRequest | FormData, mode: EndpointMode) => void;
  onGetCode: (body: Record<string, unknown>, mode: EndpointMode) => void;
  loading: boolean;
}

export function MetadataForm({ url, onSubmit, onGetCode, loading }: MetadataFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [mode, setMode] = React.useState<EndpointMode>('scan');

  const canSubmit = url.trim().length > 0 || file !== null;

  const buildJsonBody = React.useCallback((): MetadataRequest => ({ url: url.trim() }), [url]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || loading) return;

    if (file) {
      const formData = new FormData();
      formData.set('file', file);
      onSubmit(formData, mode);
      return;
    }
    onSubmit(buildJsonBody(), mode);
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Operation</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
              className={cn(
                'flex flex-col gap-1 rounded-card border p-3 text-left transition-colors duration-fast',
                mode === option.value
                  ? 'border-violet bg-violet-8 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              <span className="text-sm font-medium text-foreground">{option.label}</span>
              <span className="text-xs leading-relaxed">{option.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <FileDropzone
        id="metadata-file"
        accept={ACCEPT}
        file={file}
        onFileChange={setFile}
        idleHint="PDF, DOCX, PPTX, XLSX, PNG, JPEG — or leave it empty to use the URL above. Nothing is stored."
      />

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildJsonBody() as unknown as Record<string, unknown>, mode)}
      />
    </form>
  );
}
