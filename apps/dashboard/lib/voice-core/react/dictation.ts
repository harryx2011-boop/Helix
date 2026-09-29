import { VoiceCoreClient, type StreamHandlers } from "../client/client";
import type { TranscribeResult, VoiceCoreConnection } from "../shared/protocol";
import { MicCapture, MicError, type Mic } from "./capture";

export type DictationState = "idle" | "starting" | "listening" | "transcribing" | "error";

export interface DictationSnapshot {
  state: DictationState;
  /** The live re-decode while listening; replaced, never appended. */
  partial: string;
  error: string | null;
}

export interface Stream {
  ready: Promise<void>;
  send(pcm: Int16Array): void;
  stop(): Promise<TranscribeResult>;
  cancel(): void;
}

export interface DictationOptions {
  /** Starts the service if needed (the host's supervisor, over IPC) and returns where it is. */
  connect(): Promise<VoiceCoreConnection | null>;
  onText?(text: string): void;
  createMic?(): Mic;
  openStream?(conn: VoiceCoreConnection, handlers: StreamHandlers): Stream;
}

const IDLE: DictationSnapshot = { state: "idle", partial: "", error: null };

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Dictation failed.";
}

/**
 * The mic-button state machine, free of React so it can be tested and reused:
 * idle -> starting (mic opening, service coming up) -> listening -> transcribing
 * -> idle, with error reachable from any step. Frames captured while starting are
 * held and sent once the socket exists, so a cold start loses no speech.
 */
export class DictationController {
  private snap: DictationSnapshot = IDLE;
  private readonly listeners = new Set<() => void>();
  private run = 0;
  private mic: Mic | null = null;
  private stream: Stream | null = null;
  private starting: Promise<void> | null = null;
  private offFrame: (() => void) | null = null;

  constructor(private opts: DictationOptions) {}

  setOptions(opts: DictationOptions): void {
    this.opts = opts;
  }

  get snapshot(): DictationSnapshot {
    return this.snap;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private set(next: Partial<DictationSnapshot>): void {
    this.snap = { ...this.snap, ...next };
    for (const cb of this.listeners) cb();
  }

  private fail(gen: number, err: unknown): void {
    if (gen !== this.run) return;
    this.teardown(true);
    this.set({ state: "error", error: message(err), partial: "" });
  }

  private teardown(cancelStream: boolean): void {
    this.offFrame?.();
    this.offFrame = null;
    const mic = this.mic;
    this.mic = null;
    void mic?.stop().catch(() => {});
    if (cancelStream) this.stream?.cancel();
    this.stream = null;
  }

  start(): Promise<void> {
    const { state } = this.snap;
    if (state === "starting" || state === "listening" || state === "transcribing") {
      return this.starting ?? Promise.resolve();
    }
    const gen = ++this.run;
    this.set({ state: "starting", partial: "", error: null });
    this.starting = this.open(gen).finally(() => {
      if (gen === this.run) this.starting = null;
    });
    return this.starting;
  }

  private async open(gen: number): Promise<void> {
    const mic = (this.opts.createMic ?? (() => new MicCapture()))();
    this.mic = mic;
    const held: Int16Array[] = [];
    let stream: Stream | null = null;
    this.offFrame = mic.onFrame((pcm) => (stream ? stream.send(pcm) : held.push(pcm)));
    try {
      // A rejection, not a null, so Promise.all fails at once and the teardown
      // releases a mic that is still waiting on its permission prompt.
      const service = this.opts.connect().then((c) => {
        if (!c) throw new Error("The voice service did not start.");
        return c;
      });
      const [conn] = await Promise.all([service, mic.start()]);
      if (gen !== this.run) return;
      const open =
        this.opts.openStream ?? ((c: VoiceCoreConnection, h: StreamHandlers) => new VoiceCoreClient(c).stream(h));
      stream = open(conn, {
        onPartial: (text) => {
          if (gen === this.run && this.snap.state === "listening") this.set({ partial: text });
        },
      });
      this.stream = stream;
      for (const pcm of held.splice(0)) stream.send(pcm);
      await stream.ready;
      if (gen === this.run && this.snap.state === "starting") this.set({ state: "listening" });
    } catch (err) {
      // A tap released before the mic opened: stop() already closed it, nothing was said.
      if (err instanceof MicError && err.code === "aborted" && this.snap.state === "transcribing") return;
      this.fail(gen, err);
    }
  }

  /** Ends the utterance and resolves with its text ("" when nothing was said). */
  async stop(): Promise<string> {
    const { state } = this.snap;
    if (state !== "starting" && state !== "listening") return "";
    const gen = this.run;
    this.set({ state: "transcribing" });
    this.offFrame?.();
    this.offFrame = null;
    const mic = this.mic;
    this.mic = null;
    await mic?.stop().catch(() => {});
    if (this.starting) await this.starting;
    if (gen !== this.run) return "";
    const stream = this.stream;
    if (!stream) {
      if (this.snap.state === "transcribing") this.set({ state: "idle", partial: "" });
      return "";
    }
    try {
      const { text } = await stream.stop();
      if (gen !== this.run) return "";
      this.stream = null;
      this.set({ state: "idle", partial: "" });
      if (text) this.opts.onText?.(text);
      return text;
    } catch (err) {
      this.fail(gen, err);
      return "";
    }
  }

  cancel(): void {
    this.run++;
    this.starting = null;
    this.teardown(true);
    this.set(IDLE);
  }

  toggle(): Promise<unknown> {
    const { state } = this.snap;
    return state === "starting" || state === "listening" ? this.stop() : this.start();
  }
}
