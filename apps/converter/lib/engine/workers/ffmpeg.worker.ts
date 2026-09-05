/// <reference lib="webworker" />
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type { FfmpegWorkerRequest, WorkerMessage } from '../types';

declare const self: DedicatedWorkerGlobalScope;

const CORE_VERSION = '0.12.10';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpeg: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

/**
 * Single-threaded core, deliberately: @ffmpeg/core-mt deadlocked mid-encode
 * in testing on every input tried, including a plain h264-to-h264 pass with
 * no filters, and never resumed. That is a known category of failure for
 * pthread/Atomics-based wasm threading under certain sandboxed or
 * virtualized browser environments, not something this app's code controls,
 * so the safer default is the build that cannot hit it. The single-threaded
 * core encoded the same clip in under 4 seconds. Loaded once per worker
 * instance and reused across jobs it is handed, since ffmpeg-core.wasm is
 * tens of MB. The COOP/COEP headers stay on regardless (SharedArrayBuffer
 * isolation costs nothing when unused and is what -mt would need if this is
 * ever revisited).
 */
async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  loading ??= (async () => {
    const instance = new FFmpeg();
    instance.on('log', ({ message }) => {
      lastLog = `${lastLog}\n${message}`.slice(-16_384);
    });
    instance.on('progress', ({ progress, time }) => {
      onProgress?.(progress, time);
    });
    await instance.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpeg = instance;
    return instance;
  })();
  return loading;
}

let lastLog = '';
let onProgress: ((progress: number, time: number) => void) | null = null;

/** ffmpeg's `progress` event only fires once time-based progress is knowable. */
function reportProgress(durationSec: number, startedAt: number): void {
  onProgress = (progress, time) => {
    if (durationSec <= 0) return;
    const pct = Math.min(99, Math.max(0, Math.round(progress * 100)));
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const speed = time > 0 ? time / 1_000_000 / elapsedSec : 0;
    const remaining = durationSec * (1 - progress);
    const message: WorkerMessage = {
      kind: 'progress',
      pct,
      fps: 0,
      eta: speed > 0 ? Math.round(remaining / speed) : null,
    };
    self.postMessage(message);
  };
}

function describeError(stderr: string): string {
  const tail = stderr.toLowerCase();
  if (tail.includes('unknown decoder') || tail.includes('decoder not found'))
    return "This file uses a codec we can't read.";
  if (tail.includes('invalid data found')) return 'This file appears to be corrupt or incomplete.';
  if (tail.includes('does not contain any stream')) return 'This file contains no audio or video.';
  return 'Conversion failed.';
}

async function run(req: FfmpegWorkerRequest): Promise<void> {
  const instance = await getFfmpeg();
  lastLog = '';
  reportProgress(req.durationSec, Date.now());

  await instance.writeFile(req.inputName, new Uint8Array(req.data));

  try {
    if (req.secondPass) {
      const paletteCode = await instance.exec(req.args);
      if (paletteCode !== 0) throw new Error('palette generation failed');
      const code = await instance.exec(req.secondPass.renderArgs);
      if (code !== 0) throw new Error(describeError(lastLog));
    } else {
      const code = await instance.exec(req.args);
      if (code !== 0) throw new Error(describeError(lastLog));
    }

    const data = await instance.readFile(req.outputName);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const message: WorkerMessage = { kind: 'done', data: buffer, mime: req.mime };
    self.postMessage(message, [buffer]);
  } catch (err) {
    const message: WorkerMessage = {
      kind: 'error',
      message: err instanceof Error ? err.message : 'Conversion failed.',
      stderr: lastLog,
    };
    self.postMessage(message);
  } finally {
    onProgress = null;
    await instance.deleteFile(req.inputName).catch(() => {});
    await instance.deleteFile(req.outputName).catch(() => {});
    if (req.secondPass) await instance.deleteFile(req.secondPass.paletteName).catch(() => {});
  }
}

self.onmessage = (event: MessageEvent<FfmpegWorkerRequest>) => {
  void run(event.data);
};
