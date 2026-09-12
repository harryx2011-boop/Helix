import { describe, expect, it } from 'vitest';
import { sseSink, socketSink } from './sse.js';

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

/** A socket whose queue the test controls, the way a slow reader's would grow. */
function fakeSocket(initialBuffered = 0) {
  const sent: string[] = [];
  const socket = {
    readyState: 1,
    bufferedAmount: initialBuffered,
    send: (data: string) => {
      sent.push(data);
    },
  };
  return { socket, sent, parsed: () => sent.map((s) => JSON.parse(s) as { type: string; data?: string }) };
}

describe('socketSink', () => {
  it('forwards frames while the socket keeps up', () => {
    const { socket, parsed } = fakeSocket();
    const sink = socketSink(socket);
    sink.frame('a');
    sink.frame('b');

    expect(parsed().map((m) => m.data)).toEqual(['a', 'b']);
    expect(sink.dropped).toBe(0);
  });

  it('keeps only the newest frame while the reader is behind', () => {
    const { socket, parsed } = fakeSocket(1024 * 1024);
    const sink = socketSink(socket);
    sink.frame('old');
    sink.frame('newer');
    sink.frame('newest');

    // Nothing goes out while the queue is over the cap.
    expect(parsed()).toEqual([]);
    // Two frames were replaced rather than queued.
    expect(sink.dropped).toBe(2);

    socket.bufferedAmount = 0;
    sink.frame('current');
    const frames = parsed().filter((m) => m.type === 'frame');
    expect(frames.map((m) => m.data)).toEqual(['current']);
  });

  it('writes nothing to a socket that is not open', () => {
    const { socket, sent } = fakeSocket();
    socket.readyState = 3;
    const sink = socketSink(socket);
    sink.event('session', 'x');
    sink.frame('a');

    expect(sent).toEqual([]);
  });

  it('sends control events as typed messages', () => {
    const { socket, parsed } = fakeSocket();
    const sink = socketSink(socket);
    sink.event('session', '{"sessionId":"s1"}');
    sink.comment('ping');
    sink.event('closed', 'idle_timeout');

    expect(parsed().map((m) => m.type)).toEqual(['session', 'ping', 'closed']);
  });

  it('sends only one frame per call once backpressure clears', () => {
    const { socket, parsed } = fakeSocket(1024 * 1024);
    const sink = socketSink(socket);
    sink.frame('A');
    sink.frame('B');
    socket.bufferedAmount = 0;
    sink.frame('C');

    const frames = parsed().filter((m) => m.type === 'frame');
    expect(frames.map((m) => m.data)).toEqual(['C']);
  });
});
