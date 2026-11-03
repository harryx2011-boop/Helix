import { describe, expect, it } from 'vitest'
import { uiDevSpec } from './ui-dev'
import { DESKTOP_PORTS } from './types'

describe('ui dev child', () => {
  it('S1: runs next dev on loopback 3400 with the same-origin API build flags', () => {
    const s = uiDevSpec({
      dev: true, resources: 'r', repo: 'C:/b/wt', dataDir: 'd', runtimeDir: 'x', execPath: 'node',
      secrets: { apiKey: 'k', adminToken: 't' }, serviceToken: 's', ports: DESKTOP_PORTS, exists: () => true,
    })
    expect(s.args).toContain('dev')
    expect(s.args.slice(-2)).toEqual(['-H', '127.0.0.1'])
    expect(s.port).toBe(3400)
    expect(s.env.NEXT_PUBLIC_HELIX_API_URL).toBe('')
    expect(s.isUp(404)).toBe(true)
    expect(s.isUp(500)).toBe(false)
  })
})
