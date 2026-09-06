'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { PillButton } from '@/components/converter/pill-button';
import { AskAi } from './ask-ai';
import { Dropzone } from './dropzone';
import { KindTabs, tabForKind, type TabKind } from './kind-tabs';
import { FileRow } from './file-row';
import { SettingsPanel } from './settings-panel';
import { chimeError, chimeSuccess, installAudioUnlock, primeAudio } from '@/lib/converter/audio/chimes';
import { cancelJob, downloadUrl, submitJob, subscribe, type JobOptions, type SubmitRequest } from '@/lib/converter/jobs/client';
import { setSoundOn, upsertJob, useSoundOn } from '@/lib/converter/jobs/store';
import {
  defaultSettings,
  defaultTarget,
  detectKind,
  extOf,
  formatBytes,
  formatDelta,
  type ConvertSettings,
  type FileKind,
  type MediaMeta,
  type QueueItem,
} from '@/lib/converter/jobs/types';
import { notifyCompletion, requestNotifyPermission, type CompletedItem } from '@/lib/converter/notify';
import type { FormatPair } from '@/lib/converter/formats';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
const STAGGER_MS = 60;

function localId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

function probeMeta(file: File, kind: FileKind): Promise<MediaMeta> {
  const none: MediaMeta = { duration: null, width: null, height: null };
  if (typeof window === 'undefined') return Promise.resolve(none);
  const url = URL.createObjectURL(file);
  const done = (m: MediaMeta) => {
    URL.revokeObjectURL(url);
    return m;
  };
  return new Promise<MediaMeta>((resolve) => {
    const timer = window.setTimeout(() => resolve(done(none)), 8000);
    if (kind === 'image' || kind === 'gif') {
      const img = new Image();
      img.onload = () => {
        window.clearTimeout(timer);
        resolve(done({ duration: null, width: img.naturalWidth, height: img.naturalHeight }));
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(done(none));
      };
      img.src = url;
      return;
    }
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const v = el as HTMLVideoElement;
      resolve(
        done({
          duration: Number.isFinite(el.duration) ? el.duration : null,
          width: kind === 'video' ? v.videoWidth || null : null,
          height: kind === 'video' ? v.videoHeight || null : null,
        }),
      );
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      resolve(done(none));
    };
    el.src = url;
  });
}

function buildRequest(item: QueueItem, s: ConvertSettings): SubmitRequest {
  // Documents have their own worker and none of the media edit options.
  if (item.kind === 'document') {
    return { op: 'document', file: item.file, to: s.to, options: {} };
  }

  const options: JobOptions = {};
  if (s.trim) options.trim = s.trim;
  if (s.resize) options.resize = s.resize;
  if (s.rotate !== 0) options.rotate = s.rotate;
  if (s.flip !== 'none') options.flip = s.flip;

  if (item.kind === 'image') {
    return {
      op: 'image',
      file: item.file,
      to: s.to,
      ...(s.resize ? { resize: s.resize } : {}),
      quality: Math.max(1, Math.min(100, s.quality)),
      options,
    };
  }
  if (s.to === 'gif' && item.kind !== 'gif') {
    return { op: 'gif', file: item.file, fps: s.gif.fps, width: s.gif.width, options };
  }
  if (item.kind === 'audio') options.bitrate = [320, 256, 192, 160, 128, 96, 64][Math.round(((100 - s.quality) / 100) * 6)] ?? 128;
  else options.crf = Math.round(18 + ((100 - s.quality) / 100) * 17);

  const sameFormat = s.to === item.ext || (s.to === 'jpg' && item.ext === 'jpeg');
  if (s.targetBytes !== null && sameFormat) {
    return {
      op: 'compress',
      file: item.file,
      target: s.targetBytes,
      ...(s.preset && s.preset !== 'archive' ? { preset: s.preset } : {}),
      options,
    };
  }
  if (s.targetBytes !== null) options.targetBytes = s.targetBytes;
  return { op: 'convert', file: item.file, to: s.to, options };
}

type Batch = { ids: Set<string>; results: CompletedItem[] };

type PanelProps = {
  /** A /convert/[pair] page seeds the shared target from its manifest entry. */
  preset?: FormatPair;
};

export function ConverterPanel({ preset }: PanelProps = {}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [shared, setShared] = useState<ConvertSettings | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Which kind the empty state is advertising. Purely presentational: it
  // picks the accepted-format line under the dropzone, and follows the file
  // once one is dropped rather than filtering what may be dropped.
  const [tab, setTab] = useState<TabKind>('video');
  const [rejections, setRejections] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const soundOn = useSoundOn();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const aborters = useRef(new Map<string, AbortController>());
  const unsubs = useRef(new Map<string, () => void>());
  const sourceUrls = useRef(new Map<string, string>());
  const batch = useRef<Batch | null>(null);
  const [batchNonce, setBatchNonce] = useState(0);

  useEffect(() => {
    installAudioUnlock();
  }, []);

  useEffect(() => {
    const urls = sourceUrls.current;
    const subs = unsubs.current;
    return () => {
      for (const u of urls.values()) URL.revokeObjectURL(u);
      for (const off of subs.values()) off();
    };
  }, []);

  useEffect(() => {
    if (rejections.length === 0) return;
    const t = window.setTimeout(() => setRejections([]), 6000);
    return () => window.clearTimeout(t);
  }, [rejections]);

  const patch = useCallback((id: string, p: Partial<QueueItem> | ((prev: QueueItem) => Partial<QueueItem>)) => {
    setItems((list) => list.map((it) => (it.localId === id ? { ...it, ...(typeof p === 'function' ? p(it) : p) } : it)));
  }, []);

  const primaryKind: FileKind | null = items[0]?.kind ?? null;

  const effectiveFor = useCallback(
    (item: QueueItem): ConvertSettings => {
      const base = shared ?? defaultSettings(item.kind, item.ext);
      const kindFix = primaryKind && item.kind !== primaryKind ? { to: defaultTarget(item.kind, item.ext) } : {};
      return { ...base, ...kindFix, ...(item.override ?? {}) };
    },
    [shared, primaryKind],
  );

  const addFiles = (files: File[]) => {
    const fresh: QueueItem[] = [];
    files.forEach((file, i) => {
      const kind = detectKind(file);
      if (!kind) return;
      fresh.push({
        localId: localId(),
        file,
        name: file.name,
        ext: extOf(file.name),
        kind,
        size: file.size,
        meta: { duration: null, width: null, height: null },
        override: null,
        phase: 'idle',
        uploadPct: 0,
        pct: 0,
        eta: null,
        fps: null,
        jobId: null,
        url: null,
        outSize: null,
        error: null,
        enterDelay: i * STAGGER_MS,
      });
    });
    if (fresh.length === 0) return;
    const first = fresh[0];
    if (first) {
      setTab(tabForKind(first.kind));
      setShared((s) => {
        if (s) return s;
        const base = defaultSettings(first.kind, first.ext);
        if (!preset || preset.kind !== first.kind) return base;
        const gifWidth = typeof preset.options.width === 'number' ? preset.options.width : base.gif.width;
        const gifFps = typeof preset.options.fps === 'number' ? preset.options.fps : base.gif.fps;
        return { ...base, to: preset.to, gif: { fps: gifFps, width: gifWidth } };
      });
    }
    setItems((list) => [...list, ...fresh]);
    for (const it of fresh) {
      void probeMeta(it.file, it.kind).then((meta) => patch(it.localId, { meta }));
    }
  };

  const sourceUrlFor = (item: QueueItem): string => {
    let u = sourceUrls.current.get(item.localId);
    if (!u) {
      u = URL.createObjectURL(item.file);
      sourceUrls.current.set(item.localId, u);
    }
    return u;
  };

  const settle = (id: string, result: CompletedItem) => {
    const b = batch.current;
    if (!b || !b.ids.has(id)) return;
    b.results.push(result);
    if (b.results.length === b.ids.size) {
      const done = b.results;
      batch.current = null;
      notifyCompletion(done, (localId) => {
        const el = document.getElementById(`row-${localId}`);
        el?.scrollIntoView({ block: 'center' });
        el?.focus();
      });
      setBatchNonce((n) => n + 1);
    }
  };

  const runOne = async (item: QueueItem) => {
    const s = effectiveFor(item);
    const controller = new AbortController();
    aborters.current.set(item.localId, controller);
    patch(item.localId, { phase: 'uploading', uploadPct: 0, pct: 0, eta: null, fps: null, error: null, url: null, outSize: null, jobId: null });
    let accepted: { id: string };
    try {
      accepted = await submitJob(buildRequest(item, s), {
        signal: controller.signal,
        onUpload: (sent, total) => patch(item.localId, { uploadPct: total ? Math.round((sent / total) * 100) : 0 }),
      });
    } catch (err) {
      aborters.current.delete(item.localId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        patch(item.localId, { phase: 'cancelled' });
        settle(item.localId, { localId: item.localId, name: item.name, ok: false, inSize: item.size, outSize: null });
        return;
      }
      const message = err instanceof Error ? err.message : 'Upload failed.';
      chimeError();
      patch(item.localId, { phase: 'error', error: { message, stderr: '' } });
      settle(item.localId, { localId: item.localId, name: item.name, ok: false, inSize: item.size, outSize: null });
      return;
    }
    aborters.current.delete(item.localId);
    patch(item.localId, { phase: 'queued', jobId: accepted.id, uploadPct: 100 });

    const off = subscribe(accepted.id, {
      onFrame: (frame) => {
        switch (frame.status) {
          case 'queued':
            patch(item.localId, { phase: 'queued' });
            break;
          case 'running':
            patch(item.localId, { phase: 'running', pct: frame.pct, eta: frame.eta, fps: frame.fps ?? null });
            break;
          case 'done': {
            patch(item.localId, {
              phase: 'done',
              pct: 100,
              eta: 0,
              url: frame.url,
              outSize: frame.size,
            });
            chimeSuccess();
            upsertJob({
              id: accepted.id,
              from: item.ext,
              to: s.to,
              status: 'done',
              // The blob: URL dies with this tab, so history never carries it —
              // only that the job existed and how big the result was.
              url: null,
              size: frame.size,
              expiresAt: Date.now() + 3600_000,
            });
            setAnnounce(`${item.name} is ready. ${formatBytes(frame.size)}, ${formatDelta(item.size, frame.size)}.`);
            settle(item.localId, { localId: item.localId, name: item.name, ok: true, inSize: item.size, outSize: frame.size });
            unsubs.current.delete(item.localId);
            break;
          }
          case 'error':
            patch(item.localId, { phase: 'error', error: { message: frame.message, stderr: frame.stderr } });
            chimeError();
            upsertJob({ id: accepted.id, from: item.ext, to: s.to, status: 'error', url: null, size: null, expiresAt: Date.now() + 3600_000 });
            setAnnounce(`${item.name} failed. ${frame.message}`);
            settle(item.localId, { localId: item.localId, name: item.name, ok: false, inSize: item.size, outSize: null });
            unsubs.current.delete(item.localId);
            break;
          case 'cancelled':
            patch(item.localId, { phase: 'cancelled' });
            settle(item.localId, { localId: item.localId, name: item.name, ok: false, inSize: item.size, outSize: null });
            unsubs.current.delete(item.localId);
            break;
        }
      },
      onError: (err) => {
        patch(item.localId, (prev) =>
          prev.phase === 'done' || prev.phase === 'error' ? {} : { phase: 'error', error: { message: err.message, stderr: '' } },
        );
        settle(item.localId, { localId: item.localId, name: item.name, ok: false, inSize: item.size, outSize: null });
      },
    });
    unsubs.current.set(item.localId, off);
  };

  const start = async (only?: string[]) => {
    primeAudio();
    void requestNotifyPermission();
    const targets = itemsRef.current.filter(
      (it) => (only ? only.includes(it.localId) : true) && (it.phase === 'idle' || it.phase === 'error' || it.phase === 'cancelled'),
    );
    if (targets.length === 0) return;
    batch.current = { ids: new Set(targets.map((t) => t.localId)), results: [] };
    setBatchNonce((n) => n + 1);
    setExpanded(null);
    setAnnounce(targets.length === 1 ? `Converting ${targets[0]?.name ?? 'file'}.` : `Converting ${targets.length} files.`);
    await Promise.all(targets.map((t) => runOne(t)));
  };

  const cancel = async (item: QueueItem) => {
    aborters.current.get(item.localId)?.abort();
    if (item.jobId) {
      try {
        await cancelJob(item.jobId);
      } catch {
        // The stream's terminal frame decides the row state.
      }
      unsubs.current.get(item.localId)?.();
      unsubs.current.delete(item.localId);
      patch(item.localId, { phase: 'cancelled' });
      settle(item.localId, { localId: item.localId, name: item.name, ok: false, inSize: item.size, outSize: null });
    }
  };

  const remove = (item: QueueItem) => {
    if (item.phase === 'uploading' || item.phase === 'queued' || item.phase === 'running') void cancel(item);
    unsubs.current.get(item.localId)?.();
    unsubs.current.delete(item.localId);
    const u = sourceUrls.current.get(item.localId);
    if (u) {
      URL.revokeObjectURL(u);
      sourceUrls.current.delete(item.localId);
    }
    setItems((list) => list.filter((it) => it.localId !== item.localId));
    if (expanded === item.localId) setExpanded(null);
  };

  const download = (item: QueueItem) => {
    if (!item.jobId) return;
    const href = item.url ?? downloadUrl(item.jobId);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${item.name.replace(/\.[^.]+$/, '')}.${effectiveFor(item).to}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const clear = () => {
    for (const it of itemsRef.current) remove(it);
    setShared(null);
    setExpanded(null);
    setAiNote(null);
  };

  const summary = useMemo(() => {
    const n = items.length;
    const count = (p: QueueItem['phase']) => items.filter((i) => i.phase === p).length;
    const active = count('uploading') + count('queued') + count('running');
    const done = count('done');
    const failed = count('error') + count('cancelled');
    const idle = count('idle');
    const pct = n ? Math.round(items.reduce((acc, i) => acc + (i.phase === 'done' ? 100 : i.phase === 'running' ? i.pct : 0), 0) / n) : 0;
    return { n, active, done, failed, idle, pct };
  }, [items]);

  // batchNonce is read so the primary button re-evaluates when a batch settles.
  void batchNonce;

  const primaryState: 'idle' | 'queued' | 'running' | 'done' =
    summary.active > 0
      ? items.some((i) => i.phase === 'running')
        ? 'running'
        : 'queued'
      : summary.n > 0 && summary.done === summary.n
        ? 'done'
        : 'idle';

  const pending = summary.idle + summary.failed;
  const primaryLabel =
    primaryState === 'running'
      ? `Converting ${summary.done + 1 > summary.n ? summary.n : summary.done + 1} of ${summary.n}`
      : primaryState === 'queued'
        ? items.some((i) => i.phase === 'uploading')
          ? 'Uploading'
          : 'Queued'
        : primaryState === 'done'
          ? summary.n === 1
            ? 'Download'
            : `Download all ${summary.n}`
          : summary.failed > 0 && summary.idle === 0
            ? `Retry ${summary.failed === 1 ? '' : summary.failed + ' '}file${summary.failed === 1 ? '' : 's'}`.replace('  ', ' ')
            : `Convert ${pending === 1 ? '' : pending + ' '}file${pending === 1 ? '' : 's'}`.replace('  ', ' ');

  const onPrimary = () => {
    if (primaryState === 'done') {
      for (const it of itemsRef.current) if (it.phase === 'done') download(it);
      return;
    }
    if (primaryState === 'idle') void start();
  };

  const first = items[0];
  const hasFiles = items.length > 0;
  const settingsLocked = summary.active > 0;

  return (
    <section
      aria-label="Converter"
      className={cx(
        'mx-auto w-full max-w-3xl rounded-cv-panel border border-p-line bg-p-surface p-4 shadow-card sm:p-6',
        'transition-[transform,box-shadow] duration-[180ms]',
        dragging && '-translate-y-1 shadow-panel',
      )}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {!hasFiles && (
        <div className="mb-4 flex justify-center">
          <KindTabs value={tab} onChange={setTab} />
        </div>
      )}

      <Dropzone
        compact={hasFiles}
        disabled={settingsLocked}
        kind={tab}
        onFiles={addFiles}
        onReject={setRejections}
        onDragActive={setDragging}
      />

      {rejections.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 rounded-cv-card border border-p-line bg-p-bg px-4 py-3 text-sm text-p-ink-2 animate-fade-in">
          {rejections.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {hasFiles && (
        <ul className="mt-4 flex flex-col gap-2" aria-label="Files">
          {items.map((item) => (
            <FileRow
              key={item.localId}
              item={item}
              effective={effectiveFor(item)}
              expanded={expanded === item.localId}
              sourceUrl={item.phase === 'done' ? sourceUrlFor(item) : null}
              onToggle={() => setExpanded((e) => (e === item.localId ? null : item.localId))}
              onOverride={(p) => patch(item.localId, (prev) => ({ override: { ...(prev.override ?? {}), ...p } }))}
              onResetOverride={() => patch(item.localId, { override: null })}
              onRemove={() => remove(item)}
              onCancel={() => void cancel(item)}
              onRetry={() => void start([item.localId])}
              onDownload={() => download(item)}
            />
          ))}
        </ul>
      )}

      {hasFiles && shared && first && !settingsLocked && primaryState !== 'done' && (
        <div className="mt-6 border-t border-p-line pt-5">
          <h2 className="text-base font-semibold text-p-ink">Output</h2>
          <p className="mb-4 text-sm text-p-ink-2">
            {items.length > 1 ? 'Applies to every file. Open a row to change one file on its own.' : 'Open the row for trim, resize and rotation.'}
          </p>
          <div className="mb-4">
            <AskAi
              ctx={{ fileKind: first.kind, fileExt: first.ext, fileSizeBytes: first.size, ...(first.meta.duration !== null ? { durationSec: first.meta.duration } : {}) }}
              onResolved={(patch, explanation) => {
                setShared((s) => (s ? { ...s, ...patch } : s));
                setAiNote(explanation);
              }}
            />
            {aiNote && (
              <p role="status" className="mt-2 rounded-cv-card border border-p-line bg-p-bg px-4 py-2.5 text-sm text-p-ink-2 animate-fade-in">
                {aiNote}
              </p>
            )}
          </div>
          <SettingsPanel
            scope="shared"
            kind={first.kind}
            sourceExt={first.ext}
            inSize={items.reduce((a, i) => a + i.size, 0) / items.length}
            meta={first.meta}
            settings={shared}
            onChange={(p) => setShared((s) => (s ? { ...s, ...p } : s))}
          />
        </div>
      )}

      {hasFiles && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-p-line pt-4">
          <PillButton
            type="button"
            size="md"
            variant="ghost"
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
            onClick={() => {
              primeAudio();
              const next = !soundOn;
              setSoundOn(next);
              if (next) chimeSuccess();
            }}
          >
            {soundOn ? <Volume2 aria-hidden="true" className="h-4 w-4" /> : <VolumeX aria-hidden="true" className="h-4 w-4" />}
            {soundOn ? 'Sound on' : 'Sound off'}
          </PillButton>
          <div className="ml-auto flex items-center gap-2">
            <PillButton type="button" size="md" variant="ghost" onClick={clear} disabled={settingsLocked}>
              {primaryState === 'done' ? 'Convert more' : 'Clear'}
            </PillButton>
            <PillButton
              type="button"
              size="lg"
              variant="primary"
              state={primaryState}
              progress={summary.pct}
              sheen={primaryState === 'idle'}
              /* Busy is not disabled: disabling dims the progress fill to half
                 and drops focus, so the label change goes unannounced.
                 onPrimary already no-ops while a batch is running. */
              aria-busy={primaryState === 'queued' || primaryState === 'running'}
              onClick={onPrimary}
            >
              {primaryLabel}
            </PillButton>
          </div>
        </div>
      )}
    </section>
  );
}
