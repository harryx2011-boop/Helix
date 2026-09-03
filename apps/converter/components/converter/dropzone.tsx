'use client';

import { useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { MAX_FILE_BYTES, detectKind, formatBytes } from '@/lib/jobs/types';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Props = {
  onFiles: (files: File[]) => void;
  onReject: (messages: string[]) => void;
  onDragActive?: (active: boolean) => void;
  compact?: boolean;
  disabled?: boolean;
};

export function splitAccepted(list: FileList | File[]): { accepted: File[]; rejected: string[] } {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of Array.from(list)) {
    if (file.size > MAX_FILE_BYTES) {
      rejected.push(`${file.name} is ${formatBytes(file.size)}. The limit is 5 GB.`);
      continue;
    }
    if (detectKind(file) === null) {
      rejected.push(`${file.name} is not a video, audio, image or GIF file.`);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}

export function Dropzone({ onFiles, onReject, onDragActive, compact = false, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const hintId = useId();

  const setDrag = (next: boolean) => {
    setActive(next);
    onDragActive?.(next);
  };

  const accept = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const { accepted, rejected } = splitAccepted(list);
    if (rejected.length) onReject(rejected);
    if (accepted.length) onFiles(accepted);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={compact ? 'Add more files' : 'Drop files here or browse'}
      aria-describedby={hintId}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        depth.current += 1;
        if (depth.current === 1) setDrag(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDrag(false);
        if (!disabled) accept(e.dataTransfer.files);
      }}
      className={cx(
        'group relative flex w-full cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-card border border-dashed text-center',
        'transition-[border-color,background-color] duration-[180ms]',
        compact ? 'min-h-14 px-4 py-3' : 'min-h-[220px] px-6 py-10',
        active ? 'border-solid border-blue bg-blue-soft' : 'border-p-line-2 bg-p-bg',
        !active && !disabled && 'hover:border-p-ink-3',
        disabled && 'cursor-default opacity-60',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        accept="video/*,audio/*,image/*,.mkv,.mov,.heic,.heif,.avif,.opus,.flac"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />
      {compact ? (
        <p className="flex items-center gap-2 text-sm font-medium text-p-ink-2">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Add more files
        </p>
      ) : (
        <>
          <span
            aria-hidden="true"
            className={cx(
              'mb-3 flex h-11 w-11 items-center justify-center rounded-pill border border-p-line bg-p-surface text-p-ink-2',
              'transition-[transform,color] duration-[180ms]',
              active && '-translate-y-0.5 text-blue',
            )}
          >
            <Upload className="h-5 w-5" />
          </span>
          <p className="text-base font-medium text-p-ink">
            {active ? 'Release to add' : 'Drop files here, or click to browse'}
          </p>
          <p className="font-mono text-sm text-p-ink-2">video · audio · image · gif</p>
          <p className="text-sm text-p-ink-2">up to 5 GB</p>
          <p id={hintId} className="mt-3 text-sm text-p-ink-3">
            Files are deleted an hour after conversion.
          </p>
        </>
      )}
      {compact && (
        <span id={hintId} className="sr-only">
          Video, audio, image or GIF, up to 5 GB each.
        </span>
      )}
    </div>
  );
}
