/**
 * The /download page's install sequence as literal frames (DESIGN.md §3, §6):
 * 125 ms per frame, one change per frame, a terminal frame, no loop. Frames are
 * built by applying one change at a time and snapshotting, so the one-change
 * rule holds by construction.
 */
export const FRAME_MS = 125;

const BAR = 16;
const SERVICES = ['api', 'extract', 'fetch'] as const;

export interface FrameLine {
  text: string;
  tone?: 'done';
}

function bar(filled: number): string {
  return `[${'█'.repeat(filled)}${'░'.repeat(BAR - filled)}]`;
}

function buildFrames(installer: string): FrameLine[][] {
  const lines: FrameLine[] = [];
  const frames: FrameLine[][] = [];
  const snap = () => frames.push(lines.map((l) => ({ ...l })));

  lines.push({ text: `  download  ${bar(0)}` });
  snap();
  for (let n = 2; n <= BAR; n += 2) {
    lines[0] = { text: `  download  ${bar(n)}` };
    snap();
  }
  lines[0] = { text: `  download  ${bar(BAR)} done` };
  snap();

  lines.push({ text: `> ${installer}` });
  snap();
  const install = lines.push({ text: `  install   ${bar(0)}` }) - 1;
  snap();
  for (let n = 4; n <= BAR; n += 4) {
    lines[install] = { text: `  install   ${bar(n)}` };
    snap();
  }
  lines[install] = { text: `  install   ${bar(BAR)} done` };
  snap();

  const first = lines.length;
  for (const name of SERVICES) {
    lines.push({ text: `◇  ${name}` });
    snap();
  }
  SERVICES.forEach((name, i) => {
    lines[first + i] = { text: `◆  ${name}` };
    snap();
  });

  lines.push({ text: '▸  Helix is running on this machine.', tone: 'done' });
  snap();
  return frames;
}

export const LAST_FRAME = buildFrames('').length - 1;

const cache = new Map<string, FrameLine[][]>();

export function frameAt(frame: number, installer: string): FrameLine[] {
  let frames = cache.get(installer);
  if (!frames) {
    frames = buildFrames(installer);
    cache.set(installer, frames);
  }
  return frames[Math.max(0, Math.min(frame, LAST_FRAME))]!;
}
