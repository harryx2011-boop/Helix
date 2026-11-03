import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveWebLayout } from './layout'

describe('web layout', () => {
  it('S1: shares data and runtime with the Electron app, writes the rest under web/', () => {
    const l = resolveWebLayout(path.join('C:', 'u', 'Helix'), path.join('C:', 'b', 'wt', 'apps', 'desktop', 'out'))
    expect(l.dataDir).toBe(path.join('C:', 'u', 'Helix', 'data'))
    expect(l.runtimeDir).toBe(path.join('C:', 'u', 'Helix', 'runtime'))
    expect(l.logsDir).toBe(path.join('C:', 'u', 'Helix', 'web', 'logs'))
    expect(l.runDir).toBe(path.join('C:', 'u', 'Helix', 'web', 'run'))
    expect(l.repo).toBe(path.join('C:', 'b', 'wt'))
  })
})
