import { describe, expect, it } from 'vitest';
import { sseSink } from './sse.js';

/** `absorbs` writes fit without pressure; the next one is taken but returns false, as Node does. */
function fakeTarget(absorbs: number) {
  const written: string[] = [];
  let drain: (() => void) | undefined;
  const target = {
    writableEnded: false,
    write: (chunk: string) => {
      written.push(chunk);
      return written.length <= absorbs;
    },
    on: (_event: 'drain', listener: () => void) => {
      drain = listener;
    },
  };
  return { target, written, drain: () => drain?.() };
}

describe('sseSink', () => {
  it('forwards frames while the socket keeps up', () => {
    const { target, written } = fakeTarget(10);
    const sink = sseSink(target);
    sink.frame('a');
    sink.frame('b');
    expect(written).toEqual(['event: frame\ndata: a\n\n', 'event: frame\ndata: b\n\n']);
    expect(sink.dropped).toBe(0);
  });

  it('keeps only the newest frame while the socket is backed up, then sends it on drain', () => {
    const { target, written, drain } = fakeTarget(0);
    const sink = sseSink(target);
    sink.frame('a');
    sink.frame('b');
    sink.frame('c');
    sink.frame('d');
    expect(written).toHaveLength(1);
    expect(sink.dropped).toBe(2);

    drain();
    expect(written).toHaveLength(2);
    expect(written[1]).toBe('event: frame\ndata: d\n\n');

    drain();
    expect(written).toHaveLength(2);
  });

  it('still writes control events and heartbeats when frames are being held', () => {
    const { target, written } = fakeTarget(0);
    const sink = sseSink(target);
    sink.frame('a');
    sink.frame('b');
    sink.event('closed', 'expired');
    sink.comment('ping');
    expect(written.map((w) => w.split('\n')[0])).toEqual(['event: frame', 'event: closed', ': ping']);
  });

  it('writes nothing after the response has ended', () => {
    const { target, written } = fakeTarget(10);
    const sink = sseSink(target);
    target.writableEnded = true;
    sink.frame('a');
    sink.event('closed', 'closed');
    expect(written).toEqual([]);
  });
});
