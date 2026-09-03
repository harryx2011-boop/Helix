import type { Format } from '../ffmpeg/formats.js';

export type JobOp = 'convert' | 'compress' | 'gif' | 'image';
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type JobError = { message: string; stderr: string };

export type Job = {
  id: string;
  op: JobOp;
  from: Format | null;
  to: Format;
  status: JobStatus;
  pct: number;
  fps: number;
  eta: number | null;
  inSize: number;
  outSize: number | null;
  filename: string;
  outputPath: string | null;
  error: JobError | null;
  createdAt: number;
  expiresAt: number;
};

export type JobEvent =
  | { status: 'running'; pct: number; fps: number; eta: number | null }
  | { status: 'done'; url: string; size: number }
  | { status: 'error'; message: string; stderr: string }
  | { status: 'cancelled' };

export function publicJob(job: Job) {
  const { outputPath: _outputPath, ...rest } = job;
  return {
    ...rest,
    // History shows what the user dropped, not just `mp4 → mp3`.
    name: job.filename,
    url: job.status === 'done' ? `/v1/jobs/${job.id}/download` : null,
  };
}
