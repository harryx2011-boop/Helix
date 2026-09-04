'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';
import { getAudioContext, primeAudio } from '@/lib/audio/chimes';
import { API_BASE } from '@/lib/jobs/client';
import { formatSeconds } from '@/lib/jobs/types';
import { prefersReducedMotion } from '@/lib/theme';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
const MAX_DECODE_BYTES = 64 * 1024 ** 2;

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

async function peaksOf(file: File, buckets: number): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const offline = new OfflineAudioContext(1, 1, 44100);
  const audio = await offline.decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / buckets));
  const peaks = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const start = b * step;
    const end = Math.min(data.length, start + step);
    for (let i = start; i < end; i += 4) {
      const v = Math.abs(data[i] ?? 0);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  return peaks;
}

type WaveformProps = { file: File; className?: string };

export function Waveform({ file, className }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let cancelled = false;
    if (file.size > MAX_DECODE_BYTES) {
      setState('unavailable');
      return;
    }
    setState('loading');
    peaksOf(file, 400)
      .then((p) => {
        if (cancelled) return;
        setPeaks(p);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const g = canvas.getContext('2d');
      if (!g) return;
      g.scale(dpr, dpr);
      g.clearRect(0, 0, w, h);
      g.fillStyle = cssVar(canvas, '--p-ink-3', '#8c8c96');
      const bars = Math.min(peaks.length, Math.floor(w / 3));
      const gap = 1;
      const bw = w / bars - gap;
      const mid = h / 2;
      for (let i = 0; i < bars; i++) {
        const idx = Math.floor((i / bars) * peaks.length);
        const v = peaks[idx] ?? 0;
        const bh = Math.max(1, v * (h - 2));
        const x = i * (bw + gap);
        g.fillRect(x, mid - bh / 2, Math.max(1, bw), bh);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks]);

  if (state === 'unavailable') return null;

  return (
    <div className={cx('relative h-10 w-full', className)}>
      {state === 'loading' && <div aria-hidden="true" className="shimmer absolute inset-0 rounded-card" />}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Waveform of ${file.name}`}
        className={cx('h-full w-full transition-opacity duration-200', state === 'ready' ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}

type AbProps = {
  kind: 'audio' | 'video';
  sourceUrl: string;
  outputUrl: string;
  sourceLabel: string;
  outputLabel: string;
};

export function AbPreview({ kind, sourceUrl, outputUrl, sourceLabel, outputLabel }: AbProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const sourceNode = useRef<MediaElementAudioSourceNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const raf = useRef<number | null>(null);
  const [which, setWhich] = useState<'source' | 'output'>('output');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [level, setLevel] = useState(0);
  const lastLevelAt = useRef(0);

  const url = which === 'source' ? sourceUrl : outputUrl;
  const crossOrigin = API_BASE ? ('anonymous' as const) : undefined;

  const ensureAnalyser = () => {
    const el = mediaRef.current;
    const ctx = getAudioContext();
    if (!el || !ctx || sourceNode.current) return;
    try {
      const src = ctx.createMediaElementSource(el);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an).connect(ctx.destination);
      sourceNode.current = src;
      analyser.current = an;
    } catch {
      analyser.current = null;
    }
  };

  const loop = () => {
    const an = analyser.current;
    const meter = meterRef.current;
    if (an && meter) {
      const buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += (buf[i] ?? 0) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      const scaled = Math.min(1, rms * 3);
      const now = performance.now();
      const stepped = now - lastLevelAt.current > 250;

      // The CSS guard cannot reach an inline transform written every frame, so
      // under reduced motion the meter steps with the 250ms throttle instead of
      // animating continuously. It still indicates level, just not per frame.
      if (!prefersReducedMotion()) {
        meter.style.transform = `scaleX(${scaled.toFixed(3)})`;
      } else if (stepped) {
        meter.style.transform = `scaleX(${scaled.toFixed(2)})`;
      }

      if (stepped) {
        lastLevelAt.current = now;
        setLevel(Math.round(scaled * 100));
      }
    }
    raf.current = window.requestAnimationFrame(loop);
  };

  useEffect(() => {
    return () => {
      if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    };
  }, []);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const t = el.currentTime;
    const wasPlaying = !el.paused;
    el.src = url;
    el.load();
    el.currentTime = t;
    if (wasPlaying) void el.play().catch(() => setPlaying(false));
  }, [url]);

  const toggle = async () => {
    const el = mediaRef.current;
    if (!el) return;
    primeAudio();
    ensureAnalyser();
    if (el.paused) {
      try {
        await el.play();
      } catch {
        return;
      }
      if (raf.current === null) loop();
    } else {
      el.pause();
    }
  };

  const mediaProps = {
    ref: (el: HTMLMediaElement | null) => {
      mediaRef.current = el;
    },
    preload: 'metadata' as const,
    playsInline: true,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => setTime(e.currentTarget.currentTime),
    ...(crossOrigin ? { crossOrigin } : {}),
  };

  return (
    <div className="flex flex-col gap-3">
      {kind === 'video' ? (
        <video {...mediaProps} src={url} className="max-h-48 w-full rounded-card bg-p-code" aria-label={`${which} preview`} />
      ) : (
        <audio {...mediaProps} src={url} aria-label={`${which} preview`} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PillButton type="button" size="md" variant="secondary" onClick={toggle} aria-label={playing ? 'Pause preview' : 'Play preview'}>
          {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
          {playing ? 'Pause' : 'Play'}
        </PillButton>
        <div role="group" aria-label="Compare source and output" className="flex gap-1">
          <PillButton type="button" size="md" variant={which === 'source' ? 'primary' : 'ghost'} aria-pressed={which === 'source'} onClick={() => setWhich('source')}>
            Source <span className="font-mono text-xs opacity-70">{sourceLabel}</span>
          </PillButton>
          <PillButton type="button" size="md" variant={which === 'output' ? 'primary' : 'ghost'} aria-pressed={which === 'output'} onClick={() => setWhich('output')}>
            Output <span className="font-mono text-xs opacity-70">{outputLabel}</span>
          </PillButton>
        </div>
        <span className="font-mono text-xs tabular-nums text-p-ink-3">{formatSeconds(time)}</span>
        <div
          role="meter"
          aria-label="Playback level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={level}
          className="ml-auto h-1.5 w-24 overflow-hidden rounded-pill bg-p-code"
        >
          <div ref={meterRef} className="h-full w-full origin-left scale-x-0 rounded-pill bg-blue" />
        </div>
      </div>
    </div>
  );
}
