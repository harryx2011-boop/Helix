export const DEFAULT_PORT = 9000;
export const HOST = "127.0.0.1";
export const TOKEN_HEADER = "X-Voice-Core-Token";
export const SAMPLE_RATE = 16000;

export interface VoiceCoreConnection {
  baseUrl: string;
  token: string;
}

export interface Health {
  ok: boolean;
  service: "voice-core";
  version: string;
  model: string;
  ready: boolean;
  device: "cpu" | "cuda" | null;
  error: string | null;
  authorized: boolean;
}

export interface TranscribeResult {
  text: string;
  duration_ms: number;
  decode_ms: number;
  /** Stream only: the utterance hit the service's length cap and was finalized there. */
  truncated?: boolean;
}

export type StreamMessage =
  | { type: "ready"; model: string; device: string; partials: boolean }
  | { type: "partial"; text: string }
  | ({ type: "final" } & TranscribeResult)
  | { type: "error"; code: string; message: string };

export function wsUrl(conn: VoiceCoreConnection, path = "/stream"): string {
  const url = new URL(path, conn.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", conn.token);
  return url.toString();
}
