import { describe, expect, it, vi } from 'vitest';


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
