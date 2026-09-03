import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const ROOT = process.env.CONVERT_TMP ?? join(tmpdir(), 'helix-convert');
export const RETENTION_MS = Number(process.env.CONVERT_RETENTION_MS ?? 60 * 60 * 1000);
const SWEEP_MS = 5 * 60 * 1000;

export function jobDir(id: string): string {
  return join(ROOT, id);
}

export async function createJobDir(id: string): Promise<string> {
  const dir = jobDir(id);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function removeJobDir(id: string): Promise<void> {
  await rm(jobDir(id), { recursive: true, force: true });
}

/** Inputs are unlinked the moment the output exists; outputs expire at T+1h. */
export async function sweep(now = Date.now()): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(ROOT);
  } catch {
    return 0;
  }

  for (const entry of entries) {
    try {
      const info = await stat(join(ROOT, entry));
      if (now - info.mtimeMs > RETENTION_MS) {
        await rm(join(ROOT, entry), { recursive: true, force: true });
        removed++;
      }
    } catch {
      // raced with another sweep or a cancel; nothing to do
    }
  }
  return removed;
}

export function startSweeper(log: { info: (o: object, m: string) => void }): NodeJS.Timeout {
  const timer = setInterval(() => {
    void sweep().then((n) => {
      if (n > 0) log.info({ removed: n }, 'swept expired jobs');
    });
  }, SWEEP_MS);
  timer.unref();
  return timer;
}
