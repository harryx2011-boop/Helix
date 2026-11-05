import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createVoice, resolveVoice } from './voice'

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
