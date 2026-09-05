// Local execution seam between the UI and lib/engine. Nothing here reaches a
// network: submitJob starts a Web Worker, subscribe listens to its progress
// events, and downloadUrl is a blob: URL minted from the worker's output.

import { submitEngineJob, ValidationError, type EngineRequest, type JobHandle } from '@/lib/engine';
import type { CompressPreset, Job, JobOp, SseFrame } from './types';

export type JobOptions = {
  crf?: number; // video, 0–51
  quality?: number; // image, 1–100
  bitrate?: number; // audio, kbps
  targetBytes?: number; // convert-with-size-target; compress uses `target` directly
  trim?: { start: number; end: number };
  resize?: { width: number; height: number };
  rotate?: 0 | 90 | 180 | 270;
  flip?: 'h' | 'v' | 'hv';
};

export type SubmitRequest =
  | { op: 'convert'; file: File; to: string; options: JobOptions }
  | { op: 'compress'; file: File; target?: number; preset?: CompressPreset; options: JobOptions }
  | { op: 'gif'; file: File; fps: number; width: number; options: JobOptions }
  | {
      op: 'image';
      file: File;
      to: string;
      resize?: { width: number; height: number };
      quality?: number;
      options: JobOptions;
    };

export type Accepted = { id: string; status: 'queued' };

export type SubmitHandlers = {
  onUpload?: (sent: number, total: number) => void;
  signal?: AbortSignal;
};

export type FrameHandlers = {
  onFrame: (frame: SseFrame) => void;
  onError?: (error: Error) => void;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const jobs = new Map<string, JobHandle>();
const doneUrls = new Map<string, string>();

function toEngineRequest(req: SubmitRequest): EngineRequest {
  const { trim, resize, rotate, flip, crf, targetBytes } = req.options;
  const editOptions = {
    ...(trim ? { trim } : {}),
    ...(rotate !== undefined && rotate !== 0 ? { rotate } : {}),
    ...(flip !== undefined ? { flip } : {}),
  };

  switch (req.op) {
    case 'convert':
      return {
        op: 'convert',
        file: req.file,
        to: req.to,
        options: {
          ...editOptions,
          ...(crf !== undefined ? { crf } : {}),
          ...(req.options.bitrate !== undefined ? { audioBitrate: req.options.bitrate * 1000 } : {}),
          ...(resize ? { width: resize.width, height: resize.height } : {}),
          ...(targetBytes !== undefined ? { targetBytes } : {}),
        },
      };
    case 'compress':
      return {
        op: 'compress',
        file: req.file,
        ...(req.target !== undefined ? { target: req.target } : {}),
        ...(req.preset !== undefined ? { preset: req.preset } : {}),
        options: {
          ...editOptions,
          ...(crf !== undefined ? { crf } : {}),
          ...(req.options.bitrate !== undefined ? { audioBitrate: req.options.bitrate * 1000 } : {}),
          ...(resize ? { width: resize.width, height: resize.height } : {}),
        },
      };
    case 'gif':
      return {
        op: 'gif',
        file: req.file,
        fps: req.fps,
        width: req.width,
        options: trim ? { trim } : {},
      };
    case 'image':
      return {
        op: 'image',
        file: req.file,
        to: req.to,
        ...(resize ? { resize } : {}),
        ...(req.quality !== undefined ? { quality: req.quality } : {}),
        options: {
          ...(rotate !== undefined && rotate !== 0 ? { rotate } : {}),
          ...(flip !== undefined ? { flip } : {}),
          ...(req.quality !== undefined ? { quality: req.quality } : {}),
        },
      };
  }
}

export async function submitJob(req: SubmitRequest, handlers: SubmitHandlers = {}): Promise<Accepted> {
  // There is no upload: the file never leaves the tab. The bar still reports
  // 100% at once so the UI's existing uploading -> queued transition holds.
  handlers.onUpload?.(req.file.size, req.file.size);

  let engineReq: EngineRequest;
  try {
    engineReq = toEngineRequest(req);
  } catch (err) {
    if (err instanceof ValidationError) throw new ApiError(400, err.message);
    throw err;
  }

  const handle = submitEngineJob(engineReq);
  jobs.set(handle.id, handle);
  handle.promise
    .then((result) => doneUrls.set(handle.id, result.url))
    .catch(() => {
      // Terminal state is reported through subscribe(); nothing else observes
      // this rejection, so it must not become an unhandled rejection.
    });

  handlers.signal?.addEventListener(
    'abort',
    () => {
      handle.cancel();
      jobs.delete(handle.id);
    },
    { once: true },
  );

  return { id: handle.id, status: 'queued' };
}

export async function getJob(id: string): Promise<Job> {
  throw new ApiError(501, `getJob(${id}) is not used locally; subscribe to progress instead.`);
}

/** Listens to the worker's progress events. Returns an unsubscribe function. */
export function subscribe(id: string, handlers: FrameHandlers): () => void {
  const handle = jobs.get(id);
  if (!handle) {
    handlers.onError?.(new ApiError(404, `Job ${id} not found`));
    return () => {};
  }
  const off = handle.onProgress(handlers.onFrame);
  handle.promise.catch(() => {
    // Terminal frames (done/error/cancelled) already came through onProgress;
    // this catch exists only so the promise itself never surfaces unhandled.
  });
  return off;
}

export async function cancelJob(id: string): Promise<void> {
  const handle = jobs.get(id);
  handle?.cancel();
  jobs.delete(id);
}

/** The blob: URL minted when the job finished. Never needs resolving against a server. */
export function downloadUrl(id: string): string {
  return doneUrls.get(id) ?? '';
}
