'use client';

import { convertArgs, compressArgs, gifArgs, thumbsArgs } from './args';
import { engineFor, isFormat, type Format } from './formats';
import {
  PRESET_TARGETS,
  ValidationError,
  validateCompressOptions,
  validateConvertOptions,
  validateFormat,
  validateGifOptions,
  validateImageOptions,
  validateThumbsOptions,
  validateDocumentOptions,
  type CompressOptions,
  type ConvertOptions,
  type DocumentOptions,
  type GifOptions,
  type ImageOptions,
  type ThumbsOptions,
} from './options';
import type {
  DocumentWorkerRequest,
  EngineRequest,
  FfmpegWorkerRequest,
  ImageWorkerRequest,
  JobHandle,
  ProgressFrame,
  WorkerMessage,
} from './types';
import { probeDuration } from './probe';
import { MIME_BY_FORMAT } from './mime';
import { isDocFormat, normalizeDocExt } from './documents';

// Loaded as a plain runtime URL, not a bundler import: the worker pulls in
// libheif-js and jsquash's lazy wasm loaders, and both webpack 5's native
// worker splitting and worker-loader break Next's client-reference-manifest
// plugin when that subtree is reachable from an import Next's compiler can
// see. scripts/build-workers.mjs bundles these with esbuild, outside Next's
// graph entirely, into public/workers/ before dev and build.

export type { EngineRequest, JobHandle, ProgressFrame } from './types';
export { ValidationError } from './options';
export { ALL_FORMATS, IMAGE_FORMATS, AUDIO_FORMATS, VIDEO_FORMATS, GIF_FORMATS, isFormat, kindOf } from './formats';
export { DOC_FORMATS, DOC_TARGETS, docTargetsFor, isDocFormat, normalizeDocExt } from './documents';

let jobSeq = 0;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function nextId(): string {
  jobSeq += 1;
  return `cv_${jobSeq.toString(36)}${Date.now().toString(36)}`;
}

function makeListenable() {
  const listeners = new Set<(frame: ProgressFrame) => void>();
  return {
    emit(frame: ProgressFrame) {
      for (const l of listeners) l(frame);
    },
    onProgress(cb: (frame: ProgressFrame) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

type RunningWorker = { worker: Worker; promise: Promise<{ url: string; size: number }>; revoke: () => void };
function runWorker<Req extends { data: ArrayBuffer }>(
  scriptPath: string,
  req: Req,
  emit: (frame: ProgressFrame) => void,
): RunningWorker {
  const worker = new Worker(scriptPath, { type: 'module' });
  let blobUrl: string | null = null;

  const promise = new Promise<{ url: string; size: number }>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;
      if (msg.kind === 'progress') {
        emit({ status: 'running', pct: msg.pct, fps: msg.fps, eta: msg.eta });
      } else if (msg.kind === 'done') {
        const blob = new Blob([msg.data], { type: msg.mime });
        blobUrl = URL.createObjectURL(blob);
        emit({ status: 'done', url: blobUrl, size: blob.size });
        resolve({ url: blobUrl, size: blob.size });
        worker.terminate();
      } else if (msg.kind === 'error') {
        emit({ status: 'error', message: msg.message, stderr: msg.stderr });
        reject(new Error(msg.message));
        worker.terminate();
      }
    };
    worker.onerror = (event) => {
      const message = event.message || 'The conversion worker crashed.';
      emit({ status: 'error', message, stderr: '' });
      reject(new Error(message));
    };
    worker.postMessage(req, [req.data]);
  });

  return {
    worker,
    promise,
    revoke: () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
  };
}
function resolveCompressOptions(req: Extract<EngineRequest, { op: 'compress' }>): CompressOptions {
  const options: CompressOptions = { ...req.options };
  if (req.preset && req.target === undefined) {
    const preset = PRESET_TARGETS[req.preset];
    if (preset !== null && preset !== undefined) options.target = preset;
  }
  if (req.target !== undefined) options.target = req.target;
  validateCompressOptions(options);
  return options;
}

/**
 * Thumbnails run through ffmpeg like everything else, but produce an image, so
 * the output name and mime come from the mode rather than from a `to` the
 * caller never gives.
 */
function submitThumbsJob(req: Extract<EngineRequest, { op: 'thumbs' }>): JobHandle {
  const id = nextId();
  const { emit, onProgress } = makeListenable();
  const options: ThumbsOptions = { ...req.options };
  validateThumbsOptions(options);

  const outputFormat = options.mode === 'preview' ? 'webp' : 'png';

  let handle: RunningWorker | null = null;
  let cancelled = false;

  const promise = (async (): Promise<{ url: string; size: number }> => {
    const buffer = await req.file.arrayBuffer();
    // A sprite spaces its frames across the whole clip, so it needs the length
    // before it can pick them; the other two modes seek to a known point.
    const durationSec = options.mode === 'sprite' ? await probeDuration(req.file).catch(() => 0) : 0;
    if (cancelled) throw new DOMException('Cancelled', 'AbortError');

    const inputExt = extOf(req.file.name);
    const inputName = `in.${isFormat(inputExt) ? inputExt : 'mp4'}`;
    const outputName = `out.${outputFormat}`;

    const workerReq: FfmpegWorkerRequest = {
      kind: 'ffmpeg',
      inputName,
      outputName,
      data: buffer,
      args: thumbsArgs(inputName, outputName, options, durationSec),
      durationSec,
      mime: MIME_BY_FORMAT[outputFormat],
    };

    handle = runWorker('/workers/ffmpeg.worker.js', workerReq, emit);
    return handle.promise;
  })();

  return {
    id,
    promise,
    onProgress,
    cancel() {
      cancelled = true;
      handle?.worker.terminate();
      handle?.revoke();
      emit({ status: 'cancelled' });
    },
  };
}

function submitFfmpegJob(req: Extract<EngineRequest, { op: 'convert' | 'compress' | 'gif' }>): JobHandle {
  const id = nextId();
  const { emit, onProgress } = makeListenable();
  const inputExt = extOf(req.file.name);
  const inputFormat: Format = isFormat(inputExt) ? inputExt : 'mp4';

  let handle: RunningWorker | null = null;
  let cancelled = false;

  const promise = (async (): Promise<{ url: string; size: number }> => {
    const buffer = await req.file.arrayBuffer();
    const durationSec = await probeDuration(req.file).catch(() => 0);
    if (cancelled) throw new DOMException('Cancelled', 'AbortError');

    let workerReq: FfmpegWorkerRequest;

    if (req.op === 'gif') {
      const gifDefaults: Pick<GifOptions, 'loop' | 'dither'> = { loop: true, dither: 'sierra2_4a' };
      const options: GifOptions = { ...gifDefaults, ...req.options, fps: req.fps, width: req.width };
      validateGifOptions(options);
      const inputName = `in.${inputFormat}`;
      const outputName = 'out.gif';
      const paletteName = 'palette.png';
      const builder = gifArgs(inputName, paletteName, options);
      workerReq = {
        kind: 'ffmpeg',
        inputName,
        outputName,
        data: buffer,
        args: builder.palette,
        durationSec,
        mime: MIME_BY_FORMAT.gif,
        secondPass: { paletteName, renderArgs: builder.render(paletteName, outputName) },
      };
    } else {
      const to = validateFormat(req.op === 'convert' ? req.to : (req.to ?? inputExt), 'to');
      const inputName = `in.${inputFormat}`;
      const outputName = `out.${to}`;
      const args =
        req.op === 'compress'
          ? compressArgs(inputName, outputName, to, resolveCompressOptions(req), inputFormat, durationSec)
          : (() => {
              const options: ConvertOptions = { ...req.options };
              validateConvertOptions(options);
              return convertArgs(inputName, outputName, to, options, inputFormat, durationSec);
            })();
      workerReq = { kind: 'ffmpeg', inputName, outputName, data: buffer, args, durationSec, mime: MIME_BY_FORMAT[to] };
    }

    handle = runWorker('/workers/ffmpeg.worker.js', workerReq, emit);
    return handle.promise;
  })();

  return {
    id,
    promise,
    onProgress,
    cancel() {
      cancelled = true;
      handle?.worker.terminate();
      handle?.revoke();
      emit({ status: 'cancelled' });
    },
  };
}
function submitImageJob(req: Extract<EngineRequest, { op: 'image' }>): JobHandle {
  const id = nextId();
  const { emit, onProgress } = makeListenable();
  const to = validateFormat(req.to, 'to');
  const options: ImageOptions = { ...req.options };
  if (req.quality !== undefined) options.quality = req.quality;
  validateImageOptions(options);

  let handle: RunningWorker | null = null;
  let cancelled = false;

  const promise = (async (): Promise<{ url: string; size: number }> => {
    const buffer = await req.file.arrayBuffer();
    if (cancelled) throw new DOMException('Cancelled', 'AbortError');

    const workerReq: ImageWorkerRequest = {
      kind: 'image',
      to,
      data: buffer,
      sourceExt: extOf(req.file.name),
      options: req.resize ? { ...options, resize: req.resize } : options,
    };

    emit({ status: 'running', pct: 10, fps: 0, eta: null });
    handle = runWorker('/workers/image.worker.js', workerReq, emit);
    return handle.promise;
  })();

  return {
    id,
    promise,
    onProgress,
    cancel() {
      cancelled = true;
      handle?.worker.terminate();
      handle?.revoke();
      emit({ status: 'cancelled' });
    },
  };
}

/**
 * Documents never touch ffmpeg or the codec set: they go to their own worker,
 * which picks a pipeline from the family pair rather than from an argv.
 */
function submitDocumentJob(req: Extract<EngineRequest, { op: 'document' }>): JobHandle {
  const id = nextId();
  const { emit, onProgress } = makeListenable();
  const options: DocumentOptions = { ...req.options };
  validateDocumentOptions(options);

  let handle: RunningWorker | null = null;
  let cancelled = false;

  const promise = (async (): Promise<{ url: string; size: number }> => {
    const buffer = await req.file.arrayBuffer();
    if (cancelled) throw new DOMException('Cancelled', 'AbortError');

    const workerReq: DocumentWorkerRequest = {
      kind: 'document',
      from: extOf(req.file.name),
      to: req.to,
      data: buffer,
      name: req.file.name,
      options,
    };

    emit({ status: 'running', pct: 5, fps: 0, eta: null });
    handle = runWorker('/workers/document.worker.js', workerReq, emit);
    return handle.promise;
  })();

  return {
    id,
    promise,
    onProgress,
    cancel() {
      cancelled = true;
      handle?.worker.terminate();
      handle?.revoke();
      emit({ status: 'cancelled' });
    },
  };
}

/** One entry point; routes to the ffmpeg, image or document worker by the output kind. */
export function submitEngineJob(req: EngineRequest): JobHandle {
  if (req.op === 'thumbs') return submitThumbsJob(req);
  if (req.op === 'document') return submitDocumentJob(req);
  if (req.op === 'image') return submitImageJob(req);
  if (req.op === 'gif') return submitFfmpegJob(req);
  const to = req.op === 'convert' ? req.to : (req.to ?? extOf(req.file.name));
  // A document target reaches here when the UI submitted a plain 'convert';
  // route it by the target rather than making every caller know the split.
  if (isDocFormat(to) || normalizeDocExt(to)) {
    return submitDocumentJob({ op: 'document', file: req.file, to, options: {} });
  }
  if (isFormat(to) && engineFor(to) === 'image') {
    return submitImageJob({ op: 'image', file: req.file, to, options: req.options as ImageOptions });
  }
  return submitFfmpegJob(req);
}
