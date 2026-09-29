import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createVoice, registerVoiceIpc, resolveVoice, VOICE_CONNECT_CHANNEL, type VoiceHost } from './voice'

const RES = path.join('C:', 'Helix', 'resources')
const REPO = path.join('D:', 'Helix')

function plan(present: string[], env: NodeJS.ProcessEnv = {}) {
  const files = new Set(present)
  return resolveVoice({ resources: RES, repo: REPO, env, exists: (p) => files.has(p) })
}

describe('where voice-core comes from', () => {
  it('uses the build staged with the app', () => {
    const exe = path.join(RES, 'voice-core', 'voice-core.exe')
    expect(plan([exe])).toEqual({ command: { file: exe, args: [], cwd: path.join(RES, 'voice-core') }, env: {} })
  })

  it('prefers an override folder to the staged build', () => {
    const override = path.join('E:', 'voice')
    const exe = path.join(override, 'voice-core.exe')
    const staged = path.join(RES, 'voice-core', 'voice-core.exe')
    expect(plan([exe, staged], { HELIX_VOICE_CORE_DIR: override })?.command.file).toBe(exe)
  })

  it('ignores an override that has no exe', () => {
    const staged = path.join(RES, 'voice-core', 'voice-core.exe')
    expect(plan([staged], { HELIX_VOICE_CORE_DIR: path.join('E:', 'nothing') })?.command.file).toBe(staged)
  })

  it('falls back to a sibling checkout run through uv', () => {
    const sibling = path.resolve(REPO, '..', 'voice-core')
    const found = plan([path.join(sibling, 'pyproject.toml')])
    expect(found?.command.args).toEqual(['run', '--project', sibling, 'python', '-m', 'voice_core'])
  })

  it('reports no dictation when nothing is installed', () => {
    expect(plan([])).toBeNull()
  })

  it('turns CUDA on only when a cuBLAS folder sits beside the build', () => {
    const exe = path.join(RES, 'voice-core', 'voice-core.exe')
    const cuda = path.join(RES, 'voice-core-cuda')
    expect(plan([exe, cuda])?.env).toEqual({ VOICE_CORE_CUDA_DIR: cuda })
    expect(plan([exe])?.env).toEqual({})
  })
})

describe('an install without voice-core', () => {
  it('answers the connect call with null and stops cleanly', async () => {
    const voice = createVoice(null)
    expect(await voice.ensureStarted()).toBeNull()
    await expect(voice.stop()).resolves.toBeUndefined()
  })
})

describe('the connect channel', () => {
  const conn = { baseUrl: 'http://127.0.0.1:9000', token: 't' }
  const voice: VoiceHost = { ensureStarted: vi.fn(async () => conn), stop: vi.fn(async () => {}) }

  function setup(trusted: boolean) {
    let listener: ((e: never) => unknown) | undefined
    const ipc = {
      handle: vi.fn((channel: string, l: (e: never) => unknown) => {
        expect(channel).toBe(VOICE_CONNECT_CHANNEL)
        listener = l
      }),
      removeHandler: vi.fn(),
    }
    const dispose = registerVoiceIpc(ipc as never, voice, () => trusted)
    return { ipc, dispose, call: () => listener!({} as never) }
  }

  it('hands the connection to our own window', async () => {
    expect(await setup(true).call()).toEqual(conn)
  })

  it('gives a foreign page nothing and does not start the service for it', async () => {
    vi.mocked(voice.ensureStarted).mockClear()
    expect(await setup(false).call()).toBeNull()
    expect(voice.ensureStarted).not.toHaveBeenCalled()
  })

  it('removes the handler when disposed', () => {
    const { ipc, dispose } = setup(true)
    dispose()
    expect(ipc.removeHandler).toHaveBeenCalledWith(VOICE_CONNECT_CHANNEL)
  })
})
