export {
  VoiceCoreSupervisor,
  defaultStateDir,
  devCommand,
  packagedCommand,
  type ServiceCommand,
  type SupervisorOptions,
  type VoiceCoreStatus,
} from "./supervisor";
export { DEFAULT_PORT, TOKEN_HEADER, type Health, type VoiceCoreConnection } from "../shared/protocol";
export { speak, voiceStudioUrl, SpeakError, SPEECH_SAMPLE_RATE, type Speech, type SpeakOptions } from "../shared/speak";
