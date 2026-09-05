'use client';

import dynamic from 'next/dynamic';
import type { FormatPair } from '@/lib/formats';

// The panel's import graph reaches ffmpeg.wasm and the image codec workers,
// none of which the server compiler can or should touch: it only ever runs
// in the browser. ssr:false requires a Client Component boundary, which is
// this file; the page that renders it stays a plain server component.
const ConverterPanel = dynamic(
  () => import('./converter-panel').then((m) => m.ConverterPanel),
  { ssr: false },
);

export function ConverterPanelLoader({ preset }: { preset?: FormatPair } = {}) {
  return <ConverterPanel {...(preset ? { preset } : {})} />;
}
