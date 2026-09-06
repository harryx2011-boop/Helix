import type { CompressOptions, ConvertOptions, DocumentOptions, GifOptions, ImageOptions, ThumbsOptions } from './options';

export type EngineOp = 'convert' | 'compress' | 'gif' | 'image' | 'thumbs' | 'document';

export type EngineRequest =
  | { op: 'convert'; file: File; to: string; options: ConvertOptions }
  | { op: 'compress'; file: File; to?: string; target?: number; preset?: CompressOptions['quality']; options: ConvertOptions }
  | { op: 'gif'; file: File; fps: number; width: number; options: Partial<Omit<GifOptions, 'fps' | 'width'>> }
  | { op: 'image'; file: File; to: string; resize?: { width: number; height: number }; quality?: number; options: ImageOptions }
  | { op: 'thumbs'; file: File; options: ThumbsOptions }
  | { op: 'document'; file: File; to: string; options: DocumentOptions };

export type ProgressFrame =
  | { status: 'running'; pct: number; fps: number; eta: number | null }
  | { status: 'done'; url: string; size: number }
  | { status: 'error'; message: string; stderr: string }
  | { status: 'cancelled' };

export type JobHandle = {
  id: string;
  /** Resolves on 'done', rejects (never throws synchronously) on 'error' or 'cancelled'. */
  promise: Promise<{ url: string; size: number }>;
  onProgress(cb: (frame: ProgressFrame) => void): () => void;
  cancel(): void;
};

export class EngineError extends Error {
  constructor(
    message: string,
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/** Worker -> main thread. Mirrors the old SSE frame shape so the UI barely changes. */
export type WorkerMessage =
  | { kind: 'progress'; pct: number; fps: number; eta: number | null }
  | { kind: 'done'; data: ArrayBuffer; mime: string }
  | { kind: 'error'; message: string; stderr: string };

/**
 * Main thread -> worker. The file arrives as a transferred ArrayBuffer, never
 * copied. `args` and `secondPass.renderArgs` are fully resolved string[] —
 * never a function, which postMessage cannot structured-clone.
 */
export type FfmpegWorkerRequest = {
  kind: 'ffmpeg';
  inputName: string;
  outputName: string;
  data: ArrayBuffer;
  args: string[];
  durationSec: number;
  mime: string;
  /** GIF is two ffmpeg passes (palette then render); everything else is one. */
  secondPass?: { paletteName: string; renderArgs: string[] };
};

export type ImageWorkerRequest = {
  kind: 'image';
  to: string;
  data: ArrayBuffer;
  sourceExt: string;
  options: ImageOptions & { resize?: { width: number; height: number } };
};

/**
 * Documents arrive as a transferred ArrayBuffer like everything else, but the
 * worker decides the pipeline from the source/target family pair rather than
 * from a pre-built argv — there is no ffmpeg-style command line to construct.
 */
export type DocumentWorkerRequest = {
  kind: 'document';
  from: string;
  to: string;
  data: ArrayBuffer;
  /** For the filename shown in a PDF header and in error messages. */
  name: string;
  options: DocumentOptions;
};
