import {
  TOKEN_HEADER,
  wsUrl,
  type Health,
  type StreamMessage,
  type TranscribeResult,
  type VoiceCoreConnection,
} from "../shared/protocol";

type SocketCtor = new (url: string) => WebSocket;

export interface ClientOptions {
  fetch?: typeof fetch | undefined;
  WebSocket?: SocketCtor | undefined;
}

export class VoiceCoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VoiceCoreError";
    this.code = code;
  }
}

export interface StreamHandlers {
  onReady?(): void;
  onPartial?(text: string): void;
}

/** One utterance over WS /stream. Frames sent before the socket opens are held
 *  and flushed on open, so audio captured while the service starts is kept. */
export class StreamSession {
  private readonly ws: WebSocket;
  private readonly pending: ArrayBuffer[] = [];
  private open = false;
  private settled = false;
  private resolveFinal!: (r: TranscribeResult) => void;
  private rejectFinal!: (e: Error) => void;
  readonly final: Promise<TranscribeResult>;
  readonly ready: Promise<void>;

  constructor(url: string, Ctor: SocketCtor, handlers: StreamHandlers = {}) {
    this.final = new Promise((resolve, reject) => {
      this.resolveFinal = resolve;
      this.rejectFinal = reject;
    });
    // Callers that only await `ready` must not see an unhandled final rejection.
    this.final.catch(() => {});
    let markReady!: () => void;
    let failReady!: (e: Error) => void;
    this.ready = new Promise((resolve, reject) => {
      markReady = resolve;
      failReady = reject;
    });
    this.ready.catch(() => {});

    this.ws = new Ctor(url);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => {
      this.open = true;
      for (const frame of this.pending.splice(0)) this.ws.send(frame);
    };
    this.ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== "string") return;
      let msg: StreamMessage;
      try {
        msg = JSON.parse(ev.data) as StreamMessage;
      } catch {
        return;
      }
      if (msg.type === "ready") {
        markReady();
        handlers.onReady?.();
      } else if (msg.type === "partial") {
        handlers.onPartial?.(msg.text);
      } else if (msg.type === "final") {
        const { type: _type, ...result } = msg;
        this.settle(() => this.resolveFinal(result));
      } else if (msg.type === "error") {
        const err = new VoiceCoreError(msg.code, msg.message);
        failReady(err);
        this.settle(() => this.rejectFinal(err));
      }
    };
    this.ws.onclose = (ev: CloseEvent) => {
      const err = new VoiceCoreError(
        ev.code === 4401 || ev.code === 1008 ? "unauthorized" : "closed",
        "The voice service closed the connection.",
      );
      failReady(err);
      this.settle(() => this.rejectFinal(err));
    };
    this.ws.onerror = () => {
      const err = new VoiceCoreError("unreachable", "The voice service is not reachable.");
      failReady(err);
      this.settle(() => this.rejectFinal(err));
    };
  }

  private settle(fn: () => void): void {
    if (this.settled) return;
    this.settled = true;
    fn();
  }

  send(pcm: Int16Array): void {
    if (this.settled) return;
    const frame = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
    if (this.open) this.ws.send(frame);
    else this.pending.push(frame);
  }

  /** Ends the utterance; resolves with the final transcript. */
  stop(): Promise<TranscribeResult> {
    this.control("stop");
    return this.final;
  }

  cancel(): void {
    this.control("cancel");
    this.settle(() => this.rejectFinal(new VoiceCoreError("cancelled", "Dictation was cancelled.")));
    try {
      this.ws.close();
    } catch {
      // already closing
    }
  }

  private control(type: "stop" | "cancel"): void {
    const msg = JSON.stringify({ type });
    if (this.open) {
      this.ws.send(msg);
      return;
    }
    const flush = this.ws.onopen;
    this.ws.onopen = (ev) => {
      flush?.call(this.ws, ev);
      this.ws.send(msg);
    };
  }
}

export class VoiceCoreClient {
  private readonly doFetch: typeof fetch;
  private readonly Socket: SocketCtor;

  constructor(
    readonly connection: VoiceCoreConnection,
    opts: ClientOptions = {},
  ) {
    this.doFetch = opts.fetch ?? ((...args) => fetch(...args));
    this.Socket = opts.WebSocket ?? WebSocket;
  }

  private url(path: string): string {
    return new URL(path, this.connection.baseUrl).toString();
  }

  async health(signal?: AbortSignal): Promise<Health> {
    const res = await this.doFetch(this.url("/health"), {
      headers: { [TOKEN_HEADER]: this.connection.token },
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new VoiceCoreError("http_error", `health answered ${res.status}`);
    return (await res.json()) as Health;
  }

  /** One whole recording (any format the service decodes: WAV, WebM, Ogg...). */
  async transcribe(audio: Blob | ArrayBuffer | Uint8Array, filename = "audio.wav", signal?: AbortSignal): Promise<TranscribeResult> {
    const blob = audio instanceof Blob ? audio : new Blob([audio as BlobPart]);
    const form = new FormData();
    form.append("file", blob, filename);
    let res: Response;
    try {
      res = await this.doFetch(this.url("/transcribe"), {
        method: "POST",
        headers: { [TOKEN_HEADER]: this.connection.token },
        body: form,
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new VoiceCoreError("unreachable", "The voice service is not reachable.");
    }
    if (!res.ok) {
      const code = res.status === 401 ? "unauthorized" : res.status === 503 ? "engine_unavailable" : "http_error";
      throw new VoiceCoreError(code, `transcribe answered ${res.status}`);
    }
    return (await res.json()) as TranscribeResult;
  }

  stream(handlers?: StreamHandlers): StreamSession {
    return new StreamSession(wsUrl(this.connection), this.Socket, handlers);
  }
}
