'use client';

import { useId } from 'react';
import { FlipHorizontal2, FlipVertical2 } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { Slider } from '@/components/ui/slider';
import { CompressionControls } from './compression-controls';
import { FormatPicker } from './format-picker';
import type { ConvertSettings, FileKind, Flip, MediaMeta, Rotation } from '@/lib/jobs/types';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Props = {
  scope: 'shared' | 'file';
  kind: FileKind;
  /** Source extension. Documents narrow their targets by it (DOC_TARGETS). */
  sourceExt?: string;
  inSize: number;
  meta: MediaMeta;
  settings: ConvertSettings;
  onChange: (patch: Partial<ConvertSettings>) => void;
  isOverridden?: boolean;
  onReset?: () => void;
};

function Field({ label, id, children, hint }: { label: string; id: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[104px_1fr] sm:gap-4">
      <div className="pt-2.5">
        <span id={id} className="text-sm font-medium text-p-ink">
          {label}
        </span>
        {hint && <p className="text-caption text-p-ink-3">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function SettingsPanel({ scope, kind, sourceExt, inSize, meta, settings, onChange, isOverridden = false, onReset }: Props) {
  const p = useId();
  const isGifTarget = settings.to === 'gif' || settings.to === 'apng';
  // A document has no quality dial, no frames to trim, and no pixels to
  // resize or rotate: none of these paths are lossy in the codec sense.
  // Format is the only choice it offers.
  const isDoc = kind === 'document';
  const showSize = !isGifTarget && !isDoc;
  const showTrim = !isDoc && scope === 'file' && (kind === 'video' || kind === 'audio') && meta.duration !== null && meta.duration > 0;
  const showResize = !isDoc && scope === 'file' && kind !== 'audio' && meta.width !== null && meta.height !== null;
  const showOrient = !isDoc && scope === 'file' && kind !== 'audio';
  const duration = meta.duration ?? 0;
  const trim = settings.trim ?? { start: 0, end: duration };
  const ratio = meta.width && meta.height ? meta.width / meta.height : 1;

  const qualityLabel = kind === 'audio' ? 'Bitrate' : 'Quality';

  return (
    <div className={cx('flex flex-col gap-5', scope === 'file' && 'text-sm')}>
      {scope === 'file' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-p-ink-2">
            {isOverridden ? 'This file uses its own settings.' : 'Change anything here to override the shared settings for this file.'}
          </p>
          {isOverridden && onReset && (
            <PillButton type="button" size="md" variant="ghost" onClick={onReset}>
              Use shared
            </PillButton>
          )}
        </div>
      )}

      <Field label="Format" id={`${p}-format`}>
        <FormatPicker
          kind={kind}
          {...(sourceExt ? { sourceExt } : {})}
          value={settings.to}
          onChange={(to) => onChange({ to })}
          labelId={`${p}-format`}
        />
      </Field>

      {isGifTarget ? (
        <Field label="GIF" id={`${p}-gif`} hint="Frame rate and width">
          <div className="grid gap-4 sm:grid-cols-2">
            <Slider
              aria-label="Frame rate"
              formatValue={(v: number) => `${v} fps`}
              min={5}
              max={30}
              step={1}
              value={settings.gif.fps}
              onChange={(fps: number) => onChange({ gif: { ...settings.gif, fps } })}
            />
            <Slider
              aria-label="Width"
              formatValue={(v: number) => `${v} px`}
              min={160}
              max={1080}
              step={20}
              value={settings.gif.width}
              onChange={(width: number) => onChange({ gif: { ...settings.gif, width } })}
            />
          </div>
        </Field>
      ) : isDoc ? null : (
        <Field label={qualityLabel} id={`${p}-quality`}>
          <Slider
            aria-labelledby={`${p}-quality`}
            formatValue={(v: number) => `${v}%`}
            min={0}
            max={100}
            step={1}
            value={settings.quality}
            onChange={(quality: number) => onChange({ quality, preset: null, targetBytes: settings.preset ? null : settings.targetBytes })}
          />
        </Field>
      )}

      {showSize && (
        <Field label="Size" id={`${p}-size`}>
          <CompressionControls
            kind={kind}
            inSize={inSize}
            meta={meta}
            preset={settings.preset}
            targetBytes={settings.targetBytes}
            quality={settings.quality}
            labelId={`${p}-size`}
            allowSave={scope === 'shared'}
            onChange={(patch) => onChange(patch)}
          />
        </Field>
      )}

      {showTrim && (
        <Field label="Trim" id={`${p}-trim`} hint="Seconds from the start">
          <div className="grid gap-4 sm:grid-cols-2">
            <Slider
              aria-label="Trim start"
              formatValue={(v: number) => `${v.toFixed(1)} s`}
              min={0}
              max={Math.max(0, Math.floor(duration * 10) / 10)}
              step={0.1}
              value={Math.round(trim.start * 10) / 10}
              onChange={(start: number) =>
                onChange({ trim: { start: Math.min(start, trim.end - 0.1), end: trim.end } })
              }
            />
            <Slider
              aria-label="Trim end"
              formatValue={(v: number) => `${v.toFixed(1)} s`}
              min={0}
              max={Math.max(0, Math.floor(duration * 10) / 10)}
              step={0.1}
              value={Math.round(trim.end * 10) / 10}
              onChange={(end: number) =>
                onChange({ trim: { start: trim.start, end: Math.max(end, trim.start + 0.1) } })
              }
            />
          </div>
          {settings.trim && (
            <PillButton type="button" size="md" variant="ghost" className="mt-2" onClick={() => onChange({ trim: null })}>
              Clear trim
            </PillButton>
          )}
        </Field>
      )}

      {showResize && (
        <Field label="Resize" id={`${p}-resize`} hint="Keeps the aspect ratio">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-p-ink-2">
              W
              <input
                inputMode="numeric"
                aria-label="Width in pixels"
                value={settings.resize?.width ?? meta.width ?? ''}
                onChange={(e) => {
                  const w = parseInt(e.target.value, 10);
                  if (!Number.isFinite(w) || w <= 0) return;
                  onChange({ resize: { width: w, height: Math.max(1, Math.round(w / ratio)) } });
                }}
                className="h-11 w-24 rounded-pill border border-p-line bg-p-bg px-4 font-mono text-sm tabular-nums text-p-ink"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-p-ink-2">
              H
              <input
                inputMode="numeric"
                aria-label="Height in pixels"
                value={settings.resize?.height ?? meta.height ?? ''}
                onChange={(e) => {
                  const h = parseInt(e.target.value, 10);
                  if (!Number.isFinite(h) || h <= 0) return;
                  onChange({ resize: { width: Math.max(1, Math.round(h * ratio)), height: h } });
                }}
                className="h-11 w-24 rounded-pill border border-p-line bg-p-bg px-4 font-mono text-sm tabular-nums text-p-ink"
              />
            </label>
            <span className="font-mono text-caption text-p-ink-3">px</span>
            {settings.resize && (
              <PillButton type="button" size="md" variant="ghost" onClick={() => onChange({ resize: null })}>
                Original
              </PillButton>
            )}
          </div>
        </Field>
      )}

      {showOrient && (
        <Field label="Rotate" id={`${p}-rotate`}>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-labelledby={`${p}-rotate`} className="flex gap-1">
              {ROTATIONS.map((r) => (
                <PillButton
                  key={r}
                  type="button"
                  size="md"
                  variant={settings.rotate === r ? 'primary' : 'secondary'}
                  aria-pressed={settings.rotate === r}
                  aria-label={`Rotate ${r} degrees`}
                  onClick={() => onChange({ rotate: r })}
                >
                  <span className="font-mono">{r}°</span>
                </PillButton>
              ))}
            </div>
            <div role="group" aria-label="Flip" className="flex gap-1">
              <PillButton
                type="button"
                size="md"
                variant={settings.flip === 'h' || settings.flip === 'hv' ? 'primary' : 'secondary'}
                aria-pressed={settings.flip === 'h' || settings.flip === 'hv'}
                aria-label="Flip horizontally"
                onClick={() => onChange({ flip: toggleFlip(settings.flip, 'h') })}
              >
                <FlipHorizontal2 aria-hidden="true" className="h-4 w-4" />
                Flip H
              </PillButton>
              <PillButton
                type="button"
                size="md"
                variant={settings.flip === 'v' || settings.flip === 'hv' ? 'primary' : 'secondary'}
                aria-pressed={settings.flip === 'v' || settings.flip === 'hv'}
                aria-label="Flip vertically"
                onClick={() => onChange({ flip: toggleFlip(settings.flip, 'v') })}
              >
                <FlipVertical2 aria-hidden="true" className="h-4 w-4" />
                Flip V
              </PillButton>
            </div>
          </div>
        </Field>
      )}
    </div>
  );
}

function toggleFlip(current: Flip, axis: 'h' | 'v'): Flip {
  const h = current === 'h' || current === 'hv';
  const v = current === 'v' || current === 'hv';
  const nh = axis === 'h' ? !h : h;
  const nv = axis === 'v' ? !v : v;
  if (nh && nv) return 'hv';
  if (nh) return 'h';
  if (nv) return 'v';
  return 'none';
}
