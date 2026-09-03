import { EventEmitter } from 'node:events';
import { stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { compressArgs, convertArgs, gifArgs } from '../ffmpeg/args.js';
import { engineFor, kindOf, resolveContainer, type Format } from '../ffmpeg/formats.js';
import { convertImage } from '../ffmpeg/image.js';
import { FfmpegError, FFMPEG_BIN, probe, spawnProcess, type RunHandle } from '../ffmpeg/run.js';
import type {
  CompressOptions,
  ConvertOptions,
  GifOptions,
  ImageOptions,
} from '../ffmpeg/options.js';
import { createJobDir, jobDir, removeJobDir, RETENTION_MS } from '../storage/temp.js';
import { Queue } from './queue.js';
import type { Job, JobEvent, JobOp } from './types.js';

export type SubmitInput = {
  op: JobOp;
  to: Format;
  filename: string;
  inputPath: string;
  inSize: number;
  claimedFormat: Format | null;
  options: ConvertOptions | CompressOptions | GifOptions | ImageOptions;
};

export class JobManager extends EventEmitter {
  private readonly jobs = new Map<string, Job>();
  private readonly handles = new Map<string, RunHandle>();
  readonly queue = new Queue();

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /** Allocates the id (and its directory) so the upload can stream straight in. */
  static allocateId(): string {
    return `cv_${nanoid(10)}`;
  }

  submit(id: string, input: SubmitInput): Job {
    const now = Date.now();
    const job: Job = {
      id,
      op: input.op,
      from: input.claimedFormat,
      to: input.to,
      status: 'queued',
      pct: 0,
      fps: 0,
      eta: null,
      inSize: input.inSize,
      outSize: null,
      filename: input.filename,
      outputPath: null,
      error: null,
      createdAt: now,
      expiresAt: now + RETENTION_MS,
    };
    this.jobs.set(id, job);

    this.queue.add(
      () => this.execute(job, input),
      () => this.finishCancelled(job),
    );
    return job;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status === 'done' || job.status === 'error') return false;

    const handle = this.handles.get(id);
    if (handle) {
      handle.cancel();
      return true;
    }
    if (this.queue.dequeue(() => true)) {
      this.finishCancelled(job);
      return true;
    }
    this.finishCancelled(job);
    return true;
  }

  private emitEvent(id: string, event: JobEvent): void {
    this.emit(`job:${id}`, event);
  }

  private finishCancelled(job: Job): void {
    job.status = 'cancelled';
    this.emitEvent(job.id, { status: 'cancelled' });
    void removeJobDir(job.id);
  }

  private fail(job: Job, message: string, stderr: string): void {
    job.status = 'error';
    job.error = { message, stderr };
    this.emitEvent(job.id, { status: 'error', message, stderr });
  }

  private isCancelled(job: Job): boolean {
    return this.jobs.get(job.id)?.status === 'cancelled';
  }

  private async execute(job: Job, input: SubmitInput): Promise<void> {
    if (this.isCancelled(job)) return;
    job.status = 'running';

    try {
      const dir = jobDir(job.id);
      const outPath = join(dir, `out.${job.to}`);

      if (engineFor(job.to) === 'sharp' && input.op === 'image') {
        await convertImage(input.inputPath, outPath, job.to, input.options as ImageOptions);
      } else {
        await this.runFfmpeg(job, input, outPath);
      }

      if (this.isCancelled(job)) return;

      const info = await stat(outPath);
      job.outputPath = outPath;
      job.outSize = info.size;
      job.pct = 100;
      job.status = 'done';
      // The source is dead weight the moment the output exists.
      await unlink(input.inputPath).catch(() => {});
      this.emitEvent(job.id, {
        status: 'done',
        url: `/v1/jobs/${job.id}/download`,
        size: info.size,
      });
    } catch (err) {
      if (this.isCancelled(job)) return;
      if (err instanceof FfmpegError) {
        if (err.message === 'Cancelled') this.finishCancelled(job);
        else this.fail(job, err.message, err.stderr);
      } else {
        this.fail(job, 'Conversion failed.', err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.handles.delete(job.id);
    }
  }

  private async runFfmpeg(job: Job, input: SubmitInput, outPath: string): Promise<void> {
    const source = await probe(input.inputPath);

    // The extension is a claim; the probe is the fact. ffprobe reports a set of
    // compatible containers, so the claim has to be a member of it — not equal
    // to some arbitrary element.
    if (input.claimedFormat && source.containers.size > 0 && !source.containers.has(input.claimedFormat)) {
      const actual = source.containers.values().next().value;
      throw new FfmpegError(
        `This file is a ${actual}, not a ${input.claimedFormat}.`,
        `probe: ${source.formatName}`,
        null,
      );
    }
    const from = resolveContainer(source.containers, input.claimedFormat);
    job.from = from;

    if (!from) throw new FfmpegError("We couldn't identify this file's format.", '', null);
    if (kindOf(job.to) === 'video' && !source.hasVideo)
      throw new FfmpegError('This file contains no video track.', '', null);

    const onProgress = (p: { pct: number; fps: number; eta: number | null }) => {
      job.pct = p.pct;
      job.fps = p.fps;
      job.eta = p.eta;
      this.emitEvent(job.id, { status: 'running', ...p });
    };

    if (input.op === 'gif') {
      const palettePath = join(jobDir(job.id), 'palette.png');
      const builder = gifArgs(input.inputPath, palettePath, input.options as GifOptions, from);

      const pass1 = spawnProcess(FFMPEG_BIN, builder.palette);
      this.handles.set(job.id, pass1);
      await pass1.promise;

      const pass2 = spawnProcess(FFMPEG_BIN, builder.render(palettePath, outPath), {
        durationSec: source.duration,
        onProgress,
      });
      this.handles.set(job.id, pass2);
      await pass2.promise;
      await unlink(palettePath).catch(() => {});
      return;
    }

    const args =
      input.op === 'compress'
        ? compressArgs(
            input.inputPath,
            outPath,
            job.to,
            input.options as CompressOptions,
            from,
            source.duration,
          )
        : convertArgs(
            input.inputPath,
            outPath,
            job.to,
            input.options as ConvertOptions,
            from,
            source.duration,
          );

    const handle = spawnProcess(FFMPEG_BIN, args, {
      durationSec: source.duration,
      onProgress,
    });
    this.handles.set(job.id, handle);
    await handle.promise;
  }
}

export { createJobDir };
