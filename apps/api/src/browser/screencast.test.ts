import { describe, expect, it, vi } from 'vitest';
import { Screencast, type CastSession } from './screencast.js';

type FrameEvent = { data: string; sessionId: number; metadata: { deviceWidth: number; deviceHeight: number } };

function fakeCdp() {
  let handler: ((event: FrameEvent) => void) | undefined;
  const send = vi.fn(async () => undefined);
  const detach = vi.fn(async () => undefined);
  const session = {
    send,
    detach,
    on: (_event: 'Page.screencastFrame', listener: (event: FrameEvent) => void) => {
      handler = listener;
    },
  } as unknown as CastSession;
  return {
    session,
    send,
    detach,
    emit: (data: string, sessionId = 1) => handler?.({ data, sessionId, metadata: { deviceWidth: 1280, deviceHeight: 800 } }),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Screencast', () => {
  it('starts the cast with the first viewer and fans frames out to every viewer', async () => {
    const cdp = fakeCdp();
    const open = vi.fn(async () => cdp.session);
    const cast = new Screencast(open, { quality: 50 });

    const a = vi.fn();
    const b = vi.fn();
    cast.subscribe(a);
    cast.subscribe(b);
    await flush();

    expect(open).toHaveBeenCalledTimes(1);
    expect(cdp.send).toHaveBeenCalledWith(
      'Page.startScreencast',
      expect.objectContaining({ format: 'jpeg', quality: 50, maxWidth: 1280 }),
    );
    expect(cast.running).toBe(true);

    cdp.emit('AAAA', 7);
    expect(a).toHaveBeenCalledWith(expect.objectContaining({ data: 'AAAA', width: 1280, height: 800 }));
    expect(b).toHaveBeenCalledTimes(1);
    expect(cdp.send).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 7 });
  });

  it('gives a late viewer the last frame immediately', async () => {
    const cdp = fakeCdp();
    const cast = new Screencast(async () => cdp.session);
    cast.subscribe(() => undefined);
    await flush();
    cdp.emit('FIRST');

    const late = vi.fn();
    cast.subscribe(late);
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ data: 'FIRST' }));
  });

  it('stops the cast when the last viewer leaves', async () => {
    const cdp = fakeCdp();
    const cast = new Screencast(async () => cdp.session);
    const offA = cast.subscribe(() => undefined);
    const offB = cast.subscribe(() => undefined);
    await flush();

    offA();
    await flush();
    expect(cdp.send).not.toHaveBeenCalledWith('Page.stopScreencast');

    offB();
    await flush();
    expect(cdp.send).toHaveBeenCalledWith('Page.stopScreencast');
    expect(cdp.detach).toHaveBeenCalledTimes(1);
    expect(cast.running).toBe(false);
    expect(cast.viewers).toBe(0);
  });

  it('a viewer that throws does not stop the others', async () => {
    const cdp = fakeCdp();
    const cast = new Screencast(async () => cdp.session);
    cast.subscribe(() => {
      throw new Error('gone');
    });
    const ok = vi.fn();
    cast.subscribe(ok);
    await flush();

    cdp.emit('X');
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
