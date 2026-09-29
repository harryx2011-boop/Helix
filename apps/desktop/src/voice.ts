import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { devCommand, packagedCommand, VoiceCoreSupervisor, type ServiceCommand } from './voice-core/main'
import type { VoiceCoreConnection } from './voice-core/shared/protocol'

export const VOICE_CONNECT_CHANNEL = 'helix:voice-connect'

export interface VoiceInput {
  resources: string
  repo: string
  env: NodeJS.ProcessEnv
  exists: (p: string) => boolean
}

export interface VoicePlan {
  command: ServiceCommand
  env: Record<string, string>
}

/**
 * Where voice-core comes from: an override folder, the build staged next to the other
 * resources, then a sibling checkout run through uv (development only). Null means this
 * install has no dictation, which the UI reports instead of failing the app.
 */
export function resolveVoice(i: VoiceInput): VoicePlan | null {
  const exe = (dir: string) => path.join(dir, 'voice-core.exe')
  const override = i.env.HELIX_VOICE_CORE_DIR
  const staged = path.join(i.resources, 'voice-core')
  const sibling = path.resolve(i.repo, '..', 'voice-core')

  let command: ServiceCommand | null = null
  if (override && i.exists(exe(override))) command = packagedCommand(override)
  else if (i.exists(exe(staged))) command = packagedCommand(staged)
  else if (i.exists(path.join(sibling, 'pyproject.toml'))) command = devCommand(sibling)
  if (!command) return null

  // cuBLAS is 737 MB, so it is not in the installer by default; a folder with it beside the build turns CUDA on.
  const cuda = path.join(i.resources, 'voice-core-cuda')
  return { command, env: i.exists(cuda) ? { VOICE_CORE_CUDA_DIR: cuda } : {} }
}

export interface VoiceHost {
  ensureStarted: () => Promise<VoiceCoreConnection | null>
  stop: () => Promise<void>
}

export function createVoice(plan: VoicePlan | null): VoiceHost {
  if (!plan) return { ensureStarted: () => Promise.resolve(null), stop: () => Promise.resolve() }
  const supervisor = new VoiceCoreSupervisor({ command: plan.command, env: plan.env })
  return { ensureStarted: () => supervisor.ensureStarted(), stop: () => supervisor.stop() }
}

/** The page asks for the service through IPC and gets the token only if it is our own top document. */
export function registerVoiceIpc(
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
  voice: VoiceHost,
  trusted: (e: IpcMainInvokeEvent) => boolean,
): () => void {
  ipc.handle(VOICE_CONNECT_CHANNEL, (e) => (trusted(e) ? voice.ensureStarted() : null))
  return () => ipc.removeHandler(VOICE_CONNECT_CHANNEL)
}
