'use client';

import * as React from 'react';
import { FileUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface FileDropzoneProps {
  id: string;
  accept: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Shown when no file is selected and the zone is not being dragged over. */
  idleHint: string;
}

/**
 * Drop-to-select file zone shared by every playground form that takes an
 * upload. `dragDepth` counts nested dragenter/dragleave pairs — those fire for
 * every child element the pointer crosses, so a plain boolean flickers as it
 * moves over the label's own contents.
 */
export function FileDropzone({ id, accept, file, onFileChange, idleHint }: FileDropzoneProps) {
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);

  const clearFile = () => {
    onFileChange(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // The prompt box can clear the file too; without this the native input
  // still holds it and picking the same file again fires no change event.
  React.useEffect(() => {
    if (file === null && fileInputRef.current) fileInputRef.current.value = '';
  }, [file]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          onFileChange(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      {/*
        A label rather than a div: clicking anywhere in the zone opens the
        picker and keyboard focus reaches the real input, so the drop zone
        costs no accessibility to gain its size.
      */}
      <label
        htmlFor={id}
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
          if (dropped) onFileChange(dropped);
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
            <span className="text-xs leading-relaxed text-muted-foreground">{idleHint}</span>
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
  );
}
