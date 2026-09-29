export { VoiceCoreClient, VoiceCoreError, StreamSession, type ClientOptions, type StreamHandlers } from "./client";
export {
  DEFAULT_PORT,
  SAMPLE_RATE,
  TOKEN_HEADER,
  wsUrl,
  type Health,
  type StreamMessage,
  type TranscribeResult,
  type VoiceCoreConnection,
} from "../shared/protocol";
export { speak, voiceStudioUrl, SpeakError, SPEECH_SAMPLE_RATE, VOICESTUDIO_DEFAULT_URL, type Speech, type SpeakOptions } from "../shared/speak";
export { encodeWav } from "../shared/wav";
