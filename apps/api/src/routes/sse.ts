/**
 * A server-sent-events writer that never lets a slow reader grow the
 * process. Control events (session, closed, heartbeat) are small and always
 * written. Frames are only useful fresh: while the socket is backed up, the
 * newest frame replaces whatever was waiting, and one write goes out on
 * `drain`. A viewer that stops reading therefore costs one frame of memory,
 * not the whole session's worth.
 */

export interface SseTarget {
  write(chunk: string): boolean;
  on(event: 'drain', listener: () => void): unknown;
  readonly writableEnded: boolean;
}

export interface SseSink {
  event(name: string, data: string): void;
  frame(data: string): void;
  comment(text: string): void;
  /** Frames dropped because the reader was behind. */
  readonly dropped: number;
}

export function sseSink(target: SseTarget): SseSink {
  let backedUp = false;
  let pending: string | undefined;
  let dropped = 0;

  const put = (chunk: string) => {
    if (target.writableEnded) return;
    if (!target.write(chunk)) backedUp = true;
  };

  target.on('drain', () => {
    backedUp = false;
    if (pending !== undefined) {
      const next = pending;
      pending = undefined;
      put(`event: frame\ndata: ${next}\n\n`);
    }
  });

  return {
    event: (name, data) => put(`event: ${name}\ndata: ${data}\n\n`),
    comment: (text) => put(`: ${text}\n\n`),
    frame: (data) => {
      if (backedUp) {
        if (pending !== undefined) dropped++;
        pending = data;
        return;
      }
      put(`event: frame\ndata: ${data}\n\n`);
    },
    get dropped() {
      return dropped;
    },
  };
}

/**
 * The same policy over a WebSocket.
 *
 * A socket has no `write()` return value to read backpressure from, so the
 * queue depth stands in: while more than one frame is still unsent, the newest
 * frame replaces whatever was waiting. A viewer that stops reading costs one
 * frame of memory here too, and gets the current frame rather than a backlog
 * of stale ones when it catches up.
 */

export interface SocketTarget {
  send(data: string): void;
  readonly bufferedAmount: number;
  readonly readyState: number;
}

/** `WebSocket.OPEN`, without importing ws for one constant. */
const OPEN = 1;

/** A frame is ~30-60KB of base64 JPEG; one in flight is fine, a queue of them is not. */
const MAX_BUFFERED_BYTES = 256 * 1024;

export function socketSink(target: SocketTarget): SseSink {
  let pending: string | undefined;
  let dropped = 0;

  const put = (payload: string) => {
    if (target.readyState !== OPEN) return;
    target.send(payload);
  };

  const flush = () => {
    if (pending === undefined || target.bufferedAmount > MAX_BUFFERED_BYTES) return;
    const next = pending;
    pending = undefined;
    put(JSON.stringify({ type: 'frame', data: next }));
  };

  return {
    event: (name, data) => put(JSON.stringify({ type: name, data })),
    // A WebSocket needs no heartbeat comment to stay open, but the caller sends
    // one on the same interval; a ping frame keeps an idle proxy from closing.
    comment: () => put(JSON.stringify({ type: 'ping' })),
    frame: (data) => {
      if (target.bufferedAmount > MAX_BUFFERED_BYTES) {
        if (pending !== undefined) dropped++;
        pending = data;
        return;
      }
      flush();
      put(JSON.stringify({ type: 'frame', data }));
    },
    get dropped() {
      return dropped;
    },
  };
}
