import { describe, expect, it, vi } from 'vitest';

/**
 * A job whose worker was SIGKILLed is stranded at 'running' forever.
 *
 * 010_task_leases.sql gave `job_tasks` a visibility timeout for exactly this
 * failure, and `reclaimExpired` returns those rows to 'queued' on restart. The
 * parent `jobs` row never got the same treatment: it is flipped to 'running' at
 * claim time and reset only on the graceful shutdown path. So after a hard kill
 * the tasks are reclaimable but the job that owns them is not claimable, and
 * `POST /crawl {resume}` refuses it with `already_running` (crawl.ts:403) —
 * the documented recovery path is closed against the exact failure it exists
 * for. The crawl polls as 'running' with `started_at` set, forever.
 *
 * These tests pin the claim predicate itself, which is where the fix belongs.
 */

interface Call {
  text: string;
  values: unknown[];
}

const db = vi.hoisted(() => {
  const state = { calls: [] as Call[] };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.calls.push({ text, values });
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
});

vi.mock('../db/pool.js', () => ({ getPool: () => ({ query: db.query }) }));
vi.mock('../core/pipeline.js', () => ({ runPipeline: vi.fn() }));
vi.mock('../webhooks/deliveries.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object), enqueueDelivery: vi.fn(async () => undefined) };
});
vi.mock('../vectors/sink.js', () => ({ createSink: vi.fn(() => undefined) }));

const { CrawlWorker } = await import('./worker.js');

/** The single statement the worker uses to take ownership of a job. */
async function claimStatement(): Promise<string> {
  db.state.calls.length = 0;
  const worker = new CrawlWorker({
    fetchClient: {} as never,
    extractClient: {} as never,
    userAgent: 'HelixBot/test',
  });
  await worker.runOnce();
  const claim = db.state.calls.find((c) => c.text.includes('FOR UPDATE SKIP LOCKED'));
  expect(claim, 'the worker should issue a claim on each poll').toBeDefined();
  return claim!.text;
}

describe('crawl job claim', () => {
  it('claims queued jobs', async () => {
    expect(await claimStatement()).toMatch(/status = 'queued'/);
  });

  /* The defect. Without this the row is unreachable by every code path: the
   * worker skips it because it is not 'queued', and resume rejects it because
   * it is 'running'. */
  it('also reclaims a job whose lease has expired', async () => {
    const text = await claimStatement();
    expect(
      text,
      'a job stranded at running by a killed worker must become claimable again',
    ).toMatch(/lease_expires_at/);
  });

  it('takes a lease when it claims, so its own death is recoverable', async () => {
    const text = await claimStatement();
    expect(text).toMatch(/SET[\s\S]*lease_expires_at\s*=/i);
  });
});
