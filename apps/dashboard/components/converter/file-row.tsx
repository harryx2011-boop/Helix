'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, Download, FileAudio, FileImage, FileText, FileVideo, Film, X } from 'lucide-react';
import { PillButton } from '@/components/converter/pill-button';
import { ErrorLog } from './error-log';
import { JobProgress } from './job-progress';
import { SettingsPanel } from './settings-panel';
import { AbPreview, Waveform } from './waveform';
import { useReducedMotion } from '@/lib/converter/theme';
import { formatBytes, formatDelta, formatSeconds, type ConvertSettings, type QueueItem } from '@/lib/converter/jobs/types';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
const DONE_HOLD_MS = 600;

const KIND_ICON = { video: FileVideo, audio: FileAudio, image: FileImage, gif: Film, document: FileText } as const;

type Props = {
  item: QueueItem;
  effective: ConvertSettings;
  expanded: boolean;
  sourceUrl: string | null;
  onToggle: () => void;
  onOverride: (patch: Partial<ConvertSettings>) => void;
  onResetOverride: () => void;
  onRemove: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDownload: () => void;
};

export function FileRow({
  item,
  effective,
  expanded,
  sourceUrl,
  onToggle,
  onOverride,
  onResetOverride,
  onRemove,
  onCancel,
  onRetry,
  onDownload,
}: Props) {
  const Icon = KIND_ICON[item.kind];
  const bodyId = useId();
  const [settled, setSettled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (item.phase !== 'done') {
      setSettled(false);
      return;
    }
    const t = window.setTimeout(() => setSettled(true), DONE_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [item.phase]);

  useEffect(() => {
    if (item.phase !== 'uploading' && item.phase !== 'queued' && item.phase !== 'running') setCancelling(false);
  }, [item.phase]);

  const busy = item.phase === 'uploading' || item.phase === 'queued' || item.phase === 'running';
  const progressPhase: 'uploading' | 'queued' | 'running' | 'done' =
    item.phase === 'uploading' || item.phase === 'queued' || item.phase === 'running' ? item.phase : 'done';
  const canExpand = item.phase === 'idle' || item.phase === 'error' || item.phase === 'cancelled' || item.phase === 'done';
  const open = expanded && canExpand;
  const customised = item.override !== null && Object.keys(item.override).length > 0;
  const outLabel = item.outSize !== null ? `${formatBytes(item.outSize)} (${formatDelta(item.size, item.outSize)})` : '';

  return (
    <li
      id={`row-${item.localId}`}
      tabIndex={-1}
      style={{ animationDelay: reduced ? '0ms' : `${item.enterDelay}ms` }}
      className={cx(
        'animate-fade-up rounded-cv-card border bg-p-surface outline-none',
        item.phase === 'error' ? 'border-p-ink-3' : 'border-p-line',
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3">
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-cv-card bg-p-code text-p-ink-2">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-p-ink">{item.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 font-mono text-caption text-p-ink-3">
            <span className="uppercase">{item.ext}</span>
            <span>{formatBytes(item.size)}</span>
            {item.meta.duration !== null && <span>{formatSeconds(item.meta.duration)}</span>}
            {item.meta.width !== null && item.meta.height !== null && (
              <span>
                {item.meta.width}×{item.meta.height}
              </span>
            )}
            {customised && (
              <span className="rounded-pill bg-p-code px-2 py-0.5 text-caption font-medium leading-4 text-p-ink-2">custom</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {item.phase === 'idle' && (
            <span className="hidden rounded-pill bg-p-code px-3 py-1 font-mono text-caption uppercase text-p-ink-2 sm:inline">
              → {effective.to}
            </span>
          )}
          {item.phase === 'done' && settled && (
            <PillButton type="button" size="md" variant="secondary" onClick={onDownload} aria-label={`Download ${item.name}, ${outLabel}`} className="animate-fade-in">
              <Download aria-hidden="true" className="h-4 w-4" />
              <span className="font-mono tabular-nums">{outLabel}</span>
            </PillButton>
          )}
          {(item.phase === 'idle' || item.phase === 'done') && (
            <PillButton type="button" size="md" variant="ghost" aria-label={`Remove ${item.name}`} onClick={onRemove}>
              <X aria-hidden="true" className="h-4 w-4" />
            </PillButton>
          )}
          {canExpand && (
            <PillButton
              type="button"
              size="md"
              variant="ghost"
              aria-expanded={expanded}
              aria-controls={bodyId}
              aria-label={expanded ? `Hide settings for ${item.name}` : `Settings for ${item.name}`}
              onClick={onToggle}
            >
              <ChevronDown aria-hidden="true" className={cx('h-4 w-4 transition-transform duration-150', expanded && 'rotate-180')} />
            </PillButton>
          )}
        </div>
      </div>

      {item.kind === 'audio' && item.phase !== 'error' && (
        <div className="px-3 pb-3">
          <Waveform file={item.file} />
        </div>
      )}

      {(busy || (item.phase === 'done' && !settled)) && (
        <div
          className={cx('px-3 pb-3 transition-opacity duration-[220ms]', item.phase === 'done' && settled && 'opacity-0')}
          aria-hidden={item.phase === 'done' && settled}
        >
          <JobProgress
            phase={progressPhase}
            pct={item.pct}
            uploadPct={item.uploadPct}
            eta={item.eta}
            fps={item.fps}
            fileName={item.name}
            cancelling={cancelling}
            onCancel={() => {
              setCancelling(true);
              onCancel();
            }}
          />
        </div>
      )}

      {(item.phase === 'error' || item.phase === 'cancelled') && (
        <div className="flex flex-col gap-3 border-t border-p-line px-3 py-3 animate-fade-in">
          <p className="text-sm text-p-ink">
            {item.phase === 'cancelled' ? 'Cancelled before it finished.' : (item.error?.message ?? 'This file could not be converted.')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton type="button" size="md" variant="secondary" onClick={onRetry}>
              Retry
            </PillButton>
            <PillButton type="button" size="md" variant="ghost" onClick={onRemove}>
              Remove
            </PillButton>
          </div>
          {item.error?.stderr && <ErrorLog stderr={item.error.stderr} />}
        </div>
      )}

      {/*
        A 0fr grid row clips the panel visually, but its contents stay in the
        tab order and keep intercepting clicks over whatever is painted after
        them — the Format buttons above were unclickable because a collapsed
        row's own heading was hit-testing on top of them. `inert` takes the
        whole subtree out of hit-testing and focus while it is closed.
      */}
      <div
        id={bodyId}
        inert={!open}
        aria-hidden={open ? undefined : true}
        className={cx('grid transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-hidden">
          <div className="border-t border-p-line px-3 py-4">
            {item.phase === 'done' ? (
              (item.kind === 'audio' || item.kind === 'video') && sourceUrl && item.url ? (
                <AbPreview
                  kind={item.kind}
                  sourceUrl={sourceUrl}
                  outputUrl={item.url}
                  sourceLabel={formatBytes(item.size)}
                  outputLabel={item.outSize !== null ? formatBytes(item.outSize) : ''}
                />
              ) : (
                <p className="text-sm text-p-ink-2">Converted to {effective.to.toUpperCase()}. {outLabel}</p>
              )
            ) : (
              <SettingsPanel
                scope="file"
                kind={item.kind}
                sourceExt={item.ext}
                inSize={item.size}
                meta={item.meta}
                settings={effective}
                onChange={onOverride}
                isOverridden={customised}
                onReset={onResetOverride}
              />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
