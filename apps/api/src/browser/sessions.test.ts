import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserContext, Page } from 'playwright';
import { SessionBusyError, SessionLimitError, SessionRegistry, type CloseReason } from './sessions.js';
import type { PageLease } from './pool.js';

function fakeLease(): PageLease & { close: ReturnType<typeof vi.fn> } {
  return {
    page: { url: () => 'about:blank' } as unknown as Page,
    context: {} as BrowserContext,
    close: vi.fn(async () => undefined),
  };
}

function registry(overrides: Partial<ConstructorParameters<typeof SessionRegistry>[0]> = {}) {
  const leases: ReturnType<typeof fakeLease>[] = [];
  const reg = new SessionRegistry({
    lease: async () => {
      const lease = fakeLease();
      leases.push(lease);
      return lease;
    },
    maxSessions: 2,
    idleTimeoutMs: 5_000,
    hardTimeoutMs: 20_000,
    ...overrides,
  });
  return { reg, leases };
}

describe('SessionRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a session with an id, a view token and a hard deadline', async () => {
    const { reg } = registry();
    const session = await reg.open('key_a');

    expect(session.id).toMatch(/^sess_[0-9a-f]{16}$/);
    expect(session.viewToken).toHaveLength(48);
    expect(session.expiresAt - session.createdAt).toBe(20_000);
    expect(reg.count()).toBe(1);
    expect(reg.get(session.id, 'key_a')).toBe(session);
  });

  it('refuses to open past the operator cap', async () => {
    const { reg } = registry({ maxSessions: 1 });
    await reg.open('key_a');

    await expect(reg.open('key_a')).rejects.toBeInstanceOf(SessionLimitError);
    expect(reg.count()).toBe(1);
  });

  it('holds the cap when opens arrive together, before any lease has resolved', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { reg, leases } = registry({
      maxSessions: 2,
      lease: async () => {
        await gate;
        const lease = fakeLease();
        leases.push(lease);
        return lease;
      },
    });

    const attempts = Array.from({ length: 10 }, () => reg.open('key_a').then(() => 'open', (error: Error) => error.name));
    await Promise.resolve();
    release?.();
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r === 'open')).toHaveLength(2);
    expect(results.filter((r) => r === 'SessionLimitError')).toHaveLength(8);
    expect(reg.count()).toBe(2);
    expect(leases).toHaveLength(2);
  });

  it('gives the slot back when the lease fails', async () => {
    let fail = true;
    const { reg } = registry({
      maxSessions: 1,
      lease: async () => {
        if (fail) throw new Error('browser did not start');
        return fakeLease();
      },
    });

    await expect(reg.open('key_a')).rejects.toThrow('browser did not start');
    expect(reg.count()).toBe(0);
    fail = false;
    await expect(reg.open('key_a')).resolves.toBeDefined();
  });

  it('scopes sessions to the API key that opened them', async () => {
    const { reg } = registry();
    const session = await reg.open('key_a');

    expect(reg.get(session.id, 'key_b')).toBeUndefined();
    expect(await reg.close(session.id, 'key_b')).toBe(false);
    expect(reg.count()).toBe(1);
    expect(await reg.close(session.id, 'key_a')).toBe(true);
    expect(reg.count()).toBe(0);
  });

  it('holds a session for one request at a time', async () => {
    const { reg } = registry();
    const session = await reg.open('key_a');

    const release = reg.acquire(session);
    expect(() => reg.acquire(session)).toThrow(SessionBusyError);
    release();
    expect(() => reg.acquire(session)).not.toThrow();
  });

  it('closes an idle session and tells listeners why', async () => {
    const { reg, leases } = registry();
    const session = await reg.open('key_a');
    const reasons: CloseReason[] = [];
    session.onClose((reason) => reasons.push(reason));

    vi.advanceTimersByTime(4_999);
    expect(await reg.sweep()).toBe(0);
    expect(reg.get(session.id, 'key_a')).toBe(session);

    vi.advanceTimersByTime(1);
    expect(reg.get(session.id, 'key_a')).toBeUndefined();
    expect(await reg.sweep()).toBe(1);
    expect(reasons).toEqual(['idle']);
    expect(leases[0]?.close).toHaveBeenCalledTimes(1);
    expect(reg.count()).toBe(0);
  });

  it('activity resets the idle clock', async () => {
    const { reg } = registry();
    const session = await reg.open('key_a');

    vi.advanceTimersByTime(4_000);
    reg.acquire(session)();
    vi.advanceTimersByTime(4_000);

    expect(await reg.sweep()).toBe(0);
    expect(reg.get(session.id, 'key_a')).toBe(session);
  });

  it('a busy session cannot go idle but still hits the hard deadline', async () => {
    const { reg } = registry();
    const session = await reg.open('key_a');
    const reasons: CloseReason[] = [];
    session.onClose((reason) => reasons.push(reason));
    reg.acquire(session);

    vi.advanceTimersByTime(19_999);
    expect(await reg.sweep()).toBe(0);

    vi.advanceTimersByTime(1);
    expect(await reg.sweep()).toBe(1);
    expect(reasons).toEqual(['expired']);
  });

  it('expired sessions do not count against the cap when opening', async () => {
    const { reg } = registry({ maxSessions: 1 });
    await reg.open('key_a');

    vi.advanceTimersByTime(5_000);
    await expect(reg.open('key_a')).resolves.toBeDefined();
    expect(reg.count()).toBe(1);
  });

  it('closeAll shuts every session down', async () => {
    const { reg, leases } = registry();
    const a = await reg.open('key_a');
    const b = await reg.open('key_b');
    const reasons: CloseReason[] = [];
    a.onClose((reason) => reasons.push(reason));
    b.onClose((reason) => reasons.push(reason));

    await reg.closeAll();

    expect(reasons).toEqual(['shutdown', 'shutdown']);
    expect(leases.every((lease) => lease.close.mock.calls.length === 1)).toBe(true);
    expect(reg.count()).toBe(0);
  });

  it('resolves the live-view token only for the matching session', async () => {
    const { reg } = registry();
    const session = await reg.open('key_a');

    expect(reg.getByViewToken(session.id, session.viewToken)).toBe(session);
    expect(reg.getByViewToken(session.id, 'nope')).toBeUndefined();
    expect(reg.getByViewToken(session.id, '')).toBeUndefined();
  });
});
