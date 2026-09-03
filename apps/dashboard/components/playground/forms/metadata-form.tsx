'use client';

import * as React from 'react';
import { FileUp, X } from 'lucide-react';
import type { MetadataRequest } from '@/lib/api';
import type { EndpointMode } from '@/lib/run-endpoint';
import { Button } from '@/components/ui/button';
import { FormFooter } from './form-footer';
import { cn } from '@/lib/utils';

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg';

const MODES: { value: EndpointMode; label: string; hint: string }[] = [
  { value: 'scan', label: 'Scan', hint: 'Report what the file discloses. Nothing is changed.' },
  { value: 'scrub', label: 'Scrub', hint: 'Return a copy with the metadata removed, plus a report of what came out.' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface MetadataFormProps {
  url: string;
  onSubmit: (request: MetadataRequest | FormData, mode: EndpointMode) => void;
  onGetCode: (body: Record<string, unknown>, mode: EndpointMode) => void;
  loading: boolean;
}

export function MetadataForm({ url, onSubmit, onGetCode, loading }: MetadataFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [mode, setMode] = React.useState<EndpointMode>('scan');
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child element crossed, so a plain
  // boolean flickers as the pointer moves over the label's own contents.
  const dragDepth = React.useRef(0);

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

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

      <div className="flex flex-col gap-1.5">
        <input
          ref={fileInputRef}
          id="metadata-file"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />

        {/*
          A label rather than a div: clicking anywhere in the zone opens the
          picker and keyboard focus reaches the real input, so the drop zone
          costs no accessibility to gain its size.
        */}
        <label
          htmlFor="metadata-file"
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
          className={cn(
            'flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed p-6 text-center transition-colors duration-fast',
            'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
            dragging ? 'border-violet bg-violet-8' : 'border-border hover:bg-secondary',
          )}
        >
          <FileUp
            className={cn('h-6 w-6 transition-colors duration-fast', dragging ? 'text-violet' : 'text-muted-foreground')}
            aria-hidden
          />
          {file ? (
            <>
              <span className="max-w-full truncate text-sm font-medium text-foreground">{file.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{formatBytes(file.size)}</span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-foreground">
                {dragging ? 'Drop to load it' : 'Drop a file here, or click to choose'}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                PDF, DOCX, PPTX, XLSX, PNG, JPEG — or leave it empty to use the URL above. Nothing is stored.
              </span>
            </>
          )}
        </label>

        {file && (
          <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5" onClick={clearFile}>
            <X className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>

      <FormFooter
        loading={loading}
        disabled={!canSubmit}
        onGetCode={() => onGetCode(buildJsonBody() as unknown as Record<string, unknown>, mode)}
      />
    </form>
  );
}
