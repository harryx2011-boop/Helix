'use client';

import * as React from 'react';
import type { MetadataRequest } from '@/lib/api';
import type { EndpointMode } from '@/lib/run-endpoint';
import { UPLOAD_ACCEPT } from '@/lib/uploads';
import { FormFooter } from './form-footer';
import { FileDropzone } from '../file-dropzone';
import { cn } from '@/lib/utils';

const MODES: { value: EndpointMode; label: string; hint: string }[] = [
  { value: 'scan', label: 'Scan', hint: 'Report what the file discloses. Nothing is changed.' },
  { value: 'scrub', label: 'Scrub', hint: 'Return a copy with the metadata removed, plus a report of what came out.' },
];

interface MetadataFormProps {
  url: string;
  /** Owned by the playground so the prompt box's paperclip and this form share one file. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  onSubmit: (request: MetadataRequest | FormData, mode: EndpointMode) => void;
  onGetCode: (body: Record<string, unknown>, mode: EndpointMode) => void;
  loading: boolean;
}

export function MetadataForm({ url, file, onFileChange, onSubmit, onGetCode, loading }: MetadataFormProps) {
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
        accept={UPLOAD_ACCEPT.metadata}
        file={file}
        onFileChange={onFileChange}
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
