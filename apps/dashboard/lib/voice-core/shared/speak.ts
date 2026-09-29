/**
 * Voices come from VoiceStudio (debpalash/VoiceStudio, AGPL-3.0), installed
 * separately. Only its OpenAI-compatible HTTP API is used; none of its code is
 * bundled. Its default port 3900 collides with cortex-web's dev server, so the
 * base URL comes from VOICESTUDIO_URL.
 */

export const VOICESTUDIO_DEFAULT_URL = "http://127.0.0.1:3900";
export const SPEECH_SAMPLE_RATE = 24000;

export interface SpeakOptions {
  baseUrl?: string;
  speed?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export interface Speech {
  pcm: Int16Array;
  sampleRate: typeof SPEECH_SAMPLE_RATE;
}

export class SpeakError extends Error {
  readonly code: "unreachable" | "busy" | "refused" | "not-audio";
  constructor(code: SpeakError["code"], message: string) {
    super(message);
    this.name = "SpeakError";
    this.code = code;
  }
}

export function voiceStudioUrl(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return (env?.VOICESTUDIO_URL || VOICESTUDIO_DEFAULT_URL).replace(/\/+$/, "");
}

/** Raw 24 kHz int16 mono from POST /v1/audio/speech. `voice` is a VoiceStudio
 *  profile id, or "default" for its own default voice. */
export async function speak(text: string, voice = "default", opts: SpeakOptions = {}): Promise<Speech> {
  const base = (opts.baseUrl ?? voiceStudioUrl()).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${base}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        response_format: "pcm",
        speed: opts.speed ?? 1,
      }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new SpeakError("unreachable", "VoiceStudio is not running.");
  }
  if (res.status === 429) {
    throw new SpeakError("busy", "VoiceStudio is busy loading its voice model. Try again in a moment.");
  }
  if (!res.ok) throw new SpeakError("refused", `VoiceStudio refused the request (${res.status}).`);
  const kind = res.headers.get("content-type") ?? "";
  // A JSON error with a 200 would otherwise be played as noise.
  if (kind && !kind.startsWith("audio/") && !kind.startsWith("application/octet-stream")) {
    throw new SpeakError("not-audio", "VoiceStudio answered without audio.");
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const samples = new Int16Array(bytes.length >> 1);
  const view = new DataView(bytes.buffer, bytes.byteOffset, samples.length * 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);
  return { pcm: samples, sampleRate: SPEECH_SAMPLE_RATE };
}
