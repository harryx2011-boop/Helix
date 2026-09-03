import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertArgs, gifArgs } from '../src/ffmpeg/args.js';
import { FFMPEG_BIN, probe, run } from '../src/ffmpeg/run.js';

/**
 * Real ffmpeg, real files. Fixtures are synthesized by ffmpeg itself so the
 * repo carries no binaries and the suite runs anywhere ffmpeg exists.
 */
let dir: string;
let sourceMp4: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'helix-convert-test-'));
  sourceMp4 = join(dir, 'source.mp4');

  await run(FFMPEG_BIN, [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=15:duration=3',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=3',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    sourceMp4,
  ]);
}, 120_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('probe', () => {
  it('identifies the container and streams of a real file', async () => {
    const p = await probe(sourceMp4);
    expect(p.containers.has('mp4')).toBe(true);
    expect(p.hasVideo).toBe(true);
    expect(p.hasAudio).toBe(true);
    expect(p.width).toBe(320);
    expect(p.duration).toBeGreaterThan(2.5);
  });

  it('reports the true container regardless of the filename', async () => {
    const lying = join(dir, 'actually-mp4.wav');
    await run(FFMPEG_BIN, ['-hide_banner', '-y', '-i', sourceMp4, '-c', 'copy', '-f', 'mp4', lying]);
    const p = await probe(lying);
    expect(p.containers.has('mp4')).toBe(true);
    expect(p.containers.has('wav')).toBe(false);
  });
});

describe('video to audio', () => {
  it('produces a real mp3 with no video stream', async () => {
    const out = join(dir, 'out.mp3');
    await run(FFMPEG_BIN, convertArgs(sourceMp4, out, 'mp3', { audioBitrate: 128_000 }, 'mp4'));

    const p = await probe(out);
    expect(p.hasAudio).toBe(true);
    expect(p.hasVideo).toBe(false);
    expect(p.duration).toBeGreaterThan(2.5);
    expect((await stat(out)).size).toBeGreaterThan(1000);
  }, 60_000);
});

describe('video to video', () => {
  it('converts to webm and applies a scale filter', async () => {
    const out = join(dir, 'out.webm');
    await run(
      FFMPEG_BIN,
      convertArgs(sourceMp4, out, 'webm', { width: 160, crf: 40, preset: 'ultrafast' }, 'mp4'),
      { timeoutMs: 120_000 },
    );

    const p = await probe(out);
    expect(p.containers.has('webm')).toBe(true);
    expect(p.width).toBe(160);
    expect(p.hasVideo).toBe(true);
  }, 180_000);

  it('honours a trim', async () => {
    const out = join(dir, 'trimmed.mp4');
    await run(
      FFMPEG_BIN,
      convertArgs(sourceMp4, out, 'mp4', { trim: { start: 0.5, end: 1.5 }, preset: 'ultrafast' }, 'mp4'),
    );
    const p = await probe(out);
    expect(p.duration).toBeGreaterThan(0.7);
    expect(p.duration).toBeLessThan(1.4);
  }, 60_000);
});

describe('gif', () => {
  it('renders through a generated palette', async () => {
    const palette = join(dir, 'palette.png');
    const out = join(dir, 'out.gif');
    const builder = gifArgs(
      sourceMp4,
      palette,
      { fps: 10, width: 160, loop: true, dither: 'sierra2_4a' },
      'mp4',
    );

    await run(FFMPEG_BIN, builder.palette);
    expect((await stat(palette)).size).toBeGreaterThan(0);

    await run(FFMPEG_BIN, builder.render(palette, out), { timeoutMs: 120_000 });
    const p = await probe(out);
    expect(p.containers.has('gif')).toBe(true);
    expect(p.width).toBe(160);
  }, 180_000);
});

describe('failure handling', () => {
  it('rejects a file that is not media, with a readable message', async () => {
    const junk = join(dir, 'junk.mp4');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(junk, 'this is not a video');

    await expect(probe(junk)).rejects.toThrow();
  });

  it('refuses to read a non-file protocol', async () => {
    const out = join(dir, 'ssrf.mp4');
    // The guard pins -f to a container and whitelists only the file protocol,
    // so a URL input cannot be opened even when passed as the input path.
    const args = convertArgs('http://127.0.0.1:1/x.mp4', out, 'mp4', {}, 'mp4');
    await expect(run(FFMPEG_BIN, args, { timeoutMs: 20_000 })).rejects.toThrow();
  }, 30_000);
});
