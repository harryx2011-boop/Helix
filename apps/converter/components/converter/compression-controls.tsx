'use client';

import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { deletePreset, savePreset, usePresets } from '@/lib/jobs/store';
import { BUILTIN_PRESETS, formatBytes, type CompressPreset, type FileKind, type MediaMeta } from '@/lib/jobs/types';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const MB = 1024 ** 2;

export type Estimate = { bytes: number; detail: string };

export function estimate(
  kind: FileKind,
  inSize: number,
  meta: MediaMeta,
  targetBytes: number | null,
  quality: number,
): Estimate {
  const duration = meta.duration && meta.duration > 0 ? meta.duration : 60;
  const target = targetBytes !== null ? Math.min(targetBytes, inSize) : null;

  if (kind === 'audio') {
    const rungs = [320, 256, 192, 160, 128, 96, 64, 48, 32];
    let kbps: number;
    if (target !== null) kbps = clamp(Math.round((target * 8) / duration / 1000), 32, 320);
    else kbps = rungs[clamp(Math.round(((100 - quality) / 100) * (rungs.length - 1)), 0, rungs.length - 1)] ?? 128;
    const bytes = Math.round(((kbps * 1000) / 8) * duration);
    return { bytes: Math.min(bytes, inSize), detail: `${kbps} kbps` };
  }

  if (kind === 'image') {
    const q = target !== null ? clamp(Math.round(100 * Math.sqrt(target / inSize) * 0.9), 30, 95) : clamp(quality, 1, 100);
    const bytes = target !== null ? target : Math.round(inSize * clamp((q / 85) ** 2, 0.05, 1.3));
    const dims = meta.width && meta.height ? ` · ${meta.width}×${meta.height}` : '';
    return { bytes, detail: `q ${q}${dims}` };
  }

  // video / gif
  let crf: number;
  let bytes: number;
  if (target !== null) {
    const ratio = clamp(target / inSize, 0.01, 1.2);
    crf = clamp(Math.round(14 - 4 * Math.log2(ratio)), 18, 38);
    bytes = target;
  } else {
    crf = clamp(Math.round(18 + ((100 - quality) / 100) * 17), 18, 35);
    bytes = Math.round(inSize * clamp(2 ** (-(crf - 14) / 4), 0.05, 1.2));
  }
  const bitrate = (bytes * 8) / duration;
  const rung = bitrate >= 4e6 ? 1080 : bitrate >= 1.5e6 ? 720 : bitrate >= 6e5 ? 480 : 360;
  const height = meta.height ? Math.min(meta.height, rung) : rung;
  return { bytes, detail: `CRF ${crf} · ${height}p` };
}

type Props = {
  kind: FileKind;
  inSize: number;
  meta: MediaMeta;
  preset: CompressPreset | null;
  targetBytes: number | null;
  quality: number;
  onChange: (patch: { preset: CompressPreset | null; targetBytes: number | null; quality?: number }) => void;
  labelId: string;
  allowSave?: boolean;
};

export function CompressionControls({ kind, inSize, meta, preset, targetBytes, quality, onChange, labelId, allowSave = true }: Props) {
  const userPresets = usePresets();
  const [field, setField] = useState(targetBytes === null ? '' : (targetBytes / MB).toFixed(1));
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const fieldId = useId();
  const estId = useId();

  useEffect(() => {
    setField((prev) => {
      const parsed = parseFloat(prev);
      const prevBytes = Number.isFinite(parsed) ? Math.round(parsed * MB) : null;
      if (prevBytes === targetBytes) return prev;
      return targetBytes === null ? '' : (targetBytes / MB).toFixed(1);
    });
  }, [targetBytes]);

  const est = estimate(kind, inSize, meta, targetBytes, quality);
  const canSave = targetBytes !== null && userPresets.length < 12;

  const pickBuiltin = (p: (typeof BUILTIN_PRESETS)[number]) => {
    setActiveUser(null);
    if (preset === p.id) {
      onChange({ preset: null, targetBytes: null });
      return;
    }
    onChange({ preset: p.id, targetBytes: p.targetBytes, ...(p.id === 'archive' ? { quality: 95 } : {}) });
  };

  const pickUser = (id: string, bytes: number | null, q: number) => {
    if (activeUser === id) {
      setActiveUser(null);
      onChange({ preset: null, targetBytes: null });
      return;
    }
    setActiveUser(id);
    onChange({ preset: null, targetBytes: bytes, quality: q });
  };

  const onField = (raw: string) => {
    setField(raw);
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      if (raw.trim() === '') onChange({ preset: null, targetBytes: null });
      return;
    }
    const bytes = Math.round(n * MB);
    const match = BUILTIN_PRESETS.find((p) => p.targetBytes === bytes);
    setActiveUser(null);
    onChange({ preset: match ? match.id : null, targetBytes: bytes });
  };

  const submitSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || targetBytes === null) return;
    const saved = savePreset({ name: trimmed, targetBytes, quality });
    setActiveUser(saved.id);
    setSaving(false);
    setName('');
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
        {BUILTIN_PRESETS.map((p) => (
          <PillButton
            key={p.id}
            type="button"
            size="md"
            variant={preset === p.id ? 'primary' : 'secondary'}
            aria-pressed={preset === p.id}
            onClick={() => pickBuiltin(p)}
          >
            {p.label}
            <span className="font-mono text-xs opacity-70">{p.targetBytes === null ? 'best' : formatBytes(p.targetBytes)}</span>
          </PillButton>
        ))}
        {userPresets.map((p) => (
          <span key={p.id} className="inline-flex items-center">
            <PillButton
              type="button"
              size="md"
              variant={activeUser === p.id ? 'primary' : 'secondary'}
              aria-pressed={activeUser === p.id}
              onClick={() => pickUser(p.id, p.targetBytes, p.quality)}
            >
              {p.name}
              <span className="font-mono text-xs opacity-70">{p.targetBytes === null ? 'best' : formatBytes(p.targetBytes)}</span>
            </PillButton>
            <PillButton
              type="button"
              size="md"
              variant="ghost"
              aria-label={`Delete preset ${p.name}`}
              onClick={() => {
                if (activeUser === p.id) setActiveUser(null);
                deletePreset(p.id);
              }}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </PillButton>
          </span>
        ))}
        {allowSave && !saving && (
          <PillButton type="button" size="md" variant="ghost" disabled={!canSave} onClick={() => setSaving(true)}>
            Save preset
          </PillButton>
        )}
      </div>

      {saving && (
        <form onSubmit={submitSave} className="flex flex-wrap items-center gap-2 animate-fade-in">
          <input
            autoFocus
            aria-label="Preset name"
            placeholder="Preset name"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setSaving(false);
                setName('');
              }
            }}
            className="h-11 w-44 rounded-pill border border-p-line bg-p-bg px-4 text-sm text-p-ink placeholder:text-p-ink-3"
          />
          <PillButton type="submit" size="md" variant="secondary" disabled={!name.trim()}>
            Save
          </PillButton>
          <PillButton type="button" size="md" variant="ghost" onClick={() => setSaving(false)}>
            Cancel
          </PillButton>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={fieldId} className="text-sm text-p-ink-2">
          Target size
        </label>
        <span className="relative inline-flex items-center">
          <input
            id={fieldId}
            inputMode="decimal"
            aria-describedby={estId}
            placeholder={(inSize / MB).toFixed(1)}
            value={field}
            onChange={(e) => onField(e.target.value)}
            className={cx(
              'h-11 w-32 rounded-pill border bg-p-bg pl-4 pr-11 font-mono text-sm tabular-nums text-p-ink placeholder:text-p-ink-3',
              targetBytes !== null && targetBytes > inSize ? 'border-p-ink-3' : 'border-p-line',
            )}
          />
          <span aria-hidden="true" className="pointer-events-none absolute right-4 font-mono text-xs text-p-ink-3">
            MB
          </span>
        </span>
        <p id={estId} aria-live="polite" className="font-mono text-sm tabular-nums text-p-ink-2">
          ~{formatBytes(est.bytes)} · {est.detail}
        </p>
      </div>
      {targetBytes !== null && targetBytes > inSize && (
        <p className="text-sm text-p-ink-3">The file is already smaller than that. It will be re-encoded at the chosen quality.</p>
      )}
    </div>
  );
}
