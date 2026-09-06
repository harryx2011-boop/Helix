'use client';

import { isSoundOn } from '@/lib/converter/jobs/store';

let ctx: AudioContext | null = null;
let unlockInstalled = false;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  ctx ??= new window.AudioContext();
  return ctx;
}

export function primeAudio(): void {
  const c = getAudioContext();
  if (c && c.state === 'suspended') void c.resume();
}

/** Resumes the AudioContext on the first pointer or key gesture. Idempotent. */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const once = () => {
    primeAudio();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, { passive: true });
  window.addEventListener('keydown', once);
}

type Tone = { type: OscillatorType; from: number; to: number; ms: number; gain: number };

function play(tone: Tone): void {
  if (!isSoundOn()) return;
  const c = getAudioContext();
  if (!c || c.state !== 'running') return;
  const t0 = c.currentTime;
  const dur = tone.ms / 1000;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.from, t0);
  if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.012);
  g.gain.setValueAtTime(tone.gain, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

export function chimeSuccess(): void {
  play({ type: 'sine', from: 440, to: 660, ms: 180, gain: 0.08 });
}

export function chimeError(): void {
  play({ type: 'triangle', from: 220, to: 220, ms: 260, gain: 0.08 });
}
