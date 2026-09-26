import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalDetector } from './detect.js';

const tags = { models: [{ name: 'gemma3:4b' }, { name: 'gemma4:latest' }] };

function stubFetch(impl: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request) => impl(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createLocalDetector', () => {
  it('offers a runtime that answers on its default address, with its models', async () => {
    const fetchMock = stubFetch(async () => new Response(JSON.stringify(tags), { status: 200 }));

    const detected = await createLocalDetector()();

    expect(detected).toEqual([
      { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', models: ['gemma3:4b', 'gemma4:latest'] },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://127.0.0.1:11434/api/tags');
  });

  it('reports nothing, and does not throw, when no runtime is listening', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(createLocalDetector()()).resolves.toEqual([]);
  });

  it('reports nothing when the port answers with an error', async () => {
    stubFetch(async () => new Response('nope', { status: 500 }));

    await expect(createLocalDetector()()).resolves.toEqual([]);
  });

  it('probes once per window however many callers ask', async () => {
    const fetchMock = stubFetch(async () => new Response(JSON.stringify(tags), { status: 200 }));
    let clock = 0;
    const detect = createLocalDetector({ ttlMs: 10_000, now: () => clock });

    await detect();
    await detect();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clock = 10_001;
    await detect();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
