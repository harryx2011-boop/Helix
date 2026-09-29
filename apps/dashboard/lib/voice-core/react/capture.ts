import { MIC_WORKLET_NAME, MIC_WORKLET_SOURCE } from "./worklet";

export type MicErrorCode = "denied" | "not-found" | "unsupported" | "worklet" | "aborted" | "unknown";

export class MicError extends Error {
  readonly code: MicErrorCode;
  constructor(code: MicErrorCode, message: string) {
    super(message);
    this.name = "MicError";
    this.code = code;
  }
}

/** What the dictation controller needs from a microphone; MicCapture is the browser one. */
export interface Mic {
  start(): Promise<void>;
  stop(): Promise<void>;
  onFrame(cb: (pcm: Int16Array) => void): () => void;
}

export interface MicOptions {
  deviceId?: string;
  /** A served copy of the worklet, for a CSP that blocks blob: worklets. */
  workletUrl?: string;
}

function toMicError(e: unknown): MicError {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new MicError("denied", "Microphone blocked. Allow microphone access in Windows privacy settings.");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") {
    return new MicError("not-found", "No microphone found.");
  }
  const detail = e instanceof Error && e.message ? ` (${e.message})` : "";
  return new MicError("unknown", `Microphone unavailable${detail}.`);
}

/** Browser mic capture at 16 kHz PCM16, after Composer's src/renderer/lib/audio/capture.ts. */
export class MicCapture implements Mic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private readonly handlers = new Set<(pcm: Int16Array) => void>();
  // Bumped by stop(): a start() still awaiting the permission prompt or the
  // worklet sees it and releases what it opened instead of leaving the mic live.
  private session = 0;

  constructor(private readonly opts: MicOptions = {}) {}

  onFrame(cb: (pcm: Int16Array) => void): () => void {
    this.handlers.add(cb);
    return () => this.handlers.delete(cb);
  }

  async start(): Promise<void> {
    if (this.ctx) return;
    const session = ++this.session;
    const aborted = () => session !== this.session;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new MicError("unsupported", "This environment has no microphone API.");
    }
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: this.opts.deviceId ? { ...audio, deviceId: { exact: this.opts.deviceId } } : audio,
      });
    } catch (e) {
      if (!this.opts.deviceId) throw toMicError(e);
      // A remembered device that has since been unplugged must not lock dictation out.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch (e2) {
        throw toMicError(e2);
      }
    }
    if (aborted()) {
      stream.getTracks().forEach((t) => t.stop());
      throw new MicError("aborted", "The microphone was stopped while it was opening.");
    }

    const ctx = new AudioContext();
    let blobUrl: string | null = null;
    try {
      const url =
        this.opts.workletUrl ??
        (blobUrl = URL.createObjectURL(new Blob([MIC_WORKLET_SOURCE], { type: "text/javascript" })));
      await ctx.audioWorklet.addModule(url);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => {});
      throw new MicError("worklet", e instanceof Error ? e.message : "Could not load the audio worklet.");
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
    if (aborted()) {
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close().catch(() => {});
      throw new MicError("aborted", "The microphone was stopped while it was opening.");
    }

    const node = new AudioWorkletNode(ctx, MIC_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    node.port.onmessage = (ev: MessageEvent<Int16Array>) => {
      if (!(ev.data instanceof Int16Array)) return;
      for (const cb of this.handlers) cb(ev.data);
    };
    ctx.createMediaStreamSource(stream).connect(node);
    this.ctx = ctx;
    this.stream = stream;
    this.node = node;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  }

  async stop(): Promise<void> {
    this.session++;
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    const ctx = this.ctx;
    this.node = null;
    this.stream = null;
    this.ctx = null;
    if (ctx) await ctx.close().catch(() => {});
  }
}
