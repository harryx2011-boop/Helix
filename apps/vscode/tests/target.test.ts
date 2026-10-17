import { describe, expect, it, vi } from 'vitest';
import { candidatePorts, findApi, type FetchLike } from '../src/target';

/** Answers `/v1/health` on the given ports, refuses the rest. */
function healthOn(answers: Record<number, { status: number; body: unknown }>): FetchLike {
  return vi.fn(async (url: string) => {
    const port = Number(new URL(url).port);
    const answer = answers[port];
    if (!answer) throw new Error('ECONNREFUSED');
    return { status: answer.status, json: async () => answer.body };
  });
}

describe('candidatePorts', () => {
  it('tries the desktop app first, then the dev API', () => {
    expect(candidatePorts(undefined)).toEqual([7410, 7400]);
  });

  it('tries only a pinned port', () => {
    expect(candidatePorts(7500)).toEqual([7500]);
  });

  it('ignores a pinned value that is not a real port, so it never reaches a URL', () => {
    for (const bad of ['7400@evil.example', 0, -1, 70000, 74.5, Number.NaN, null]) {
      expect(candidatePorts(bad)).toEqual([7410, 7400]);
    }
  });
});

describe('findApi', () => {
  it('picks the desktop app when it answers', async () => {
    const fetch = healthOn({
      7410: { status: 200, body: { status: 'ok', version: '2.3.2' } },
      7400: { status: 200, body: { status: 'ok', version: '2.3.2' } },
    });
    const api = await findApi([7410, 7400], fetch);
    expect(api).toEqual({ port: 7410, origin: 'http://127.0.0.1:7410', status: 'ok', version: '2.3.2' });
  });

  it('falls back to the dev API when the desktop app is not running', async () => {
    const fetch = healthOn({ 7400: { status: 200, body: { status: 'ok', version: '2.3.2' } } });
    expect((await findApi([7410, 7400], fetch))?.port).toBe(7400);
  });

  it('counts a degraded API (503) as running', async () => {
    const fetch = healthOn({ 7410: { status: 503, body: { status: 'degraded', version: '2.3.2' } } });
    expect(await findApi([7410], fetch)).toMatchObject({ port: 7410, status: 'degraded' });
  });

  it('is null when nothing answers', async () => {
    expect(await findApi([7410, 7400], healthOn({}))).toBeNull();
  });

  it('skips a port that answers something other than Helix', async () => {
    const fetch = healthOn({
      7410: { status: 404, body: {} },
      7400: { status: 200, body: { status: 'ok', version: '2.3.2' } },
    });
    expect((await findApi([7410, 7400], fetch))?.port).toBe(7400);
  });
});
