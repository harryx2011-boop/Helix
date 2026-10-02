import { describe, expect, it } from 'vitest';
import { FRAME_MS, LAST_FRAME, frameAt } from './install-frames';

const EXE = 'Helix-Setup-1.2.0.exe';
const texts = (n: number) => frameAt(n, EXE).map((l) => l.text);

describe('frameAt', () => {
  it('opens on an empty download bar, before the installer can run', () => {
    expect(texts(0)).toEqual(['  download  [░░░░░░░░░░░░░░░░]']);
  });

  it('fills the download bar two cells per frame', () => {
    expect(texts(3)[0]).toBe('  download  [██████░░░░░░░░░░]');
  });

  it('downloads, then runs the installer, then installs, in that order', () => {
    const last = texts(LAST_FRAME);
    expect(last.slice(0, 3)).toEqual([
      '  download  [████████████████] done',
      `> ${EXE}`,
      '  install   [████████████████] done',
    ]);
  });

  it('ends on every part ready and the running line, and never past it', () => {
    const last = frameAt(LAST_FRAME, EXE);
    expect(last.map((l) => l.text).slice(3)).toEqual(['◆  getting ready', '◆  page reader', '◆  document reader', '▸  Helix is running on this PC.']);
    expect(last.at(-1)?.tone).toBe('done');
    expect(frameAt(LAST_FRAME + 50, EXE)).toEqual(last);
  });

  it('changes exactly one thing per frame', () => {
    for (let n = 1; n <= LAST_FRAME; n++) {
      const prev = texts(n - 1);
      const cur = texts(n);
      const changed = cur.filter((line, i) => line !== prev[i]).length;
      expect(changed, `frame ${n}`).toBe(1);
    }
  });

  it('marks a bar done only on the frame after it fills', () => {
    for (let n = 1; n <= LAST_FRAME; n++) {
      texts(n).forEach((line, i) => {
        if (line.endsWith('] done')) expect(texts(n - 1)[i]).toMatch(/done$|\[█{16}\]$/);
      });
    }
  });

  it('never shows a service ready before it has been shown starting', () => {
    for (let n = 0; n <= LAST_FRAME; n++) {
      for (const line of texts(n).filter((l) => l.startsWith('◆'))) {
        expect(texts(n - 1).some((l) => l === `◇${line.slice(1)}` || l === line)).toBe(true);
      }
    }
  });

  it('runs under three seconds, so 8 fps never has to downgrade to 2 Hz', () => {
    expect(LAST_FRAME * FRAME_MS).toBeLessThanOrEqual(3000);
  });
});
