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
