
export interface SseTarget {
  write(chunk: string): boolean;
  on(event: 'drain', listener: () => void): unknown;
  readonly writableEnded: boolean;
}

export interface SseSink {
  event(name: string, data: string): void;
  frame(data: string): void;
  comment(text: string): void;
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


export interface SocketTarget {
  send(data: string): void;
  readonly bufferedAmount: number;
  readonly readyState: number;
}

const OPEN = 1;

const MAX_BUFFERED_BYTES = 256 * 1024;

export function socketSink(target: SocketTarget): SseSink {
  let pending: string | undefined;
  let dropped = 0;

  const put = (payload: string) => {
    if (target.readyState !== OPEN) return;
    target.send(payload);
  };

  return {
    event: (name, data) => put(JSON.stringify({ type: name, data })),
    comment: () => put(JSON.stringify({ type: 'ping' })),
    frame: (data) => {
      if (target.bufferedAmount > MAX_BUFFERED_BYTES) {
        if (pending !== undefined) dropped++;
        pending = data;
        return;
      }
      pending = undefined;
      put(JSON.stringify({ type: 'frame', data }));
    },
    get dropped() {
      return dropped;
    },
  };
}
