import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileStore, imageOf, killStale, parseProcList, planStaleKills, type PidRecord, type PidStore } from './pidfile'

const rec = (name: string, pid: number, image: string, startedAt: number): PidRecord => ({ name, pid, image, startedAt })

describe('planStaleKills', () => {
  const records = [rec('api', 100, 'helix.exe', 1_000_000), rec('extract', 200, 'helix-extract.exe', 1_000_000), rec('fetch', 300, 'helix-fetch.exe', 1_000_000)]

  it('kills a pid that still runs the recorded image, created at spawn time', () => {
    const out = planStaleKills(records, [{ pid: 100, image: 'Helix.exe', createdAt: 1_000_250 }])
    expect(out.map((r) => r.name)).toEqual(['api'])
  })

  it('spares a dead pid', () => {
    expect(planStaleKills(records, [])).toEqual([])
  })

  it('spares a recycled pid running a different program', () => {
    expect(planStaleKills(records, [{ pid: 200, image: 'chrome.exe', createdAt: 1_000_000 }])).toEqual([])
  })

  it('spares a recycled pid with the same image but a later creation time', () => {
    expect(planStaleKills(records, [{ pid: 300, image: 'helix-fetch.exe', createdAt: 1_000_000 + 60_000 }])).toEqual([])
  })
})

describe('parseProcList', () => {
  it('reads pid|name|epoch-ms lines and skips junk', () => {
    const out = parseProcList('100|Helix.exe|1727300000000\r\n\r\ngarbage\r\n200|helix-fetch.exe|1727300000500\n')
    expect(out).toEqual([
      { pid: 100, image: 'Helix.exe', createdAt: 1727300000000 },
      { pid: 200, image: 'helix-fetch.exe', createdAt: 1727300000500 },
    ])
  })
})

describe('imageOf', () => {
  it('lowercases the basename', () => {
    expect(imageOf('C:\\Program Files\\Helix\\Helix.exe')).toBe('helix.exe')
    expect(imageOf('node')).toBe('node.exe')
  })
})

describe('killStale', () => {
  function memStore(initial: PidRecord[]): PidStore & { data: Map<string, PidRecord> } {
    const data = new Map(initial.map((r) => [r.name, r]))
    return { data, write: (r) => void data.set(r.name, r), remove: (n) => void data.delete(n), readAll: () => [...data.values()] }
  }

  it('kills only matching processes and clears every record', async () => {
    const store = memStore([rec('api', 100, 'helix.exe', 5000), rec('fetch', 300, 'helix-fetch.exe', 5000)])
    const killTree = vi.fn()
    const killed = await killStale({
      store,
      list: async () => [{ pid: 100, image: 'helix.exe', createdAt: 5100 }],
      killTree,
      log: () => {},
    })
    expect(killed.map((r) => r.pid)).toEqual([100])
    expect(killTree.mock.calls).toEqual([[100]])
    expect(store.data.size).toBe(0)
  })

  it('kills nothing when the process list fails, and still clears records', async () => {
    const store = memStore([rec('api', 100, 'helix.exe', 5000)])
    const killTree = vi.fn()
    await killStale({ store, list: () => Promise.reject(new Error('no powershell')), killTree, log: () => {} })
    expect(killTree).not.toHaveBeenCalled()
    expect(store.data.size).toBe(0)
  })

  it('does not list processes when there are no records', async () => {
    const list = vi.fn()
    await killStale({ store: memStore([]), list, killTree: vi.fn(), log: () => {} })
    expect(list).not.toHaveBeenCalled()
  })
})

describe('fileStore', () => {
  let dir = ''
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }))

  it('round-trips records and discards a corrupt file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-pid-'))
    const store = fileStore(path.join(dir, 'run'))
    store.write(rec('api', 42, 'helix.exe', 1))
    fs.writeFileSync(path.join(dir, 'run', 'bad.pid'), '{not json')
    expect(store.readAll()).toEqual([rec('api', 42, 'helix.exe', 1)])
    expect(fs.existsSync(path.join(dir, 'run', 'bad.pid'))).toBe(false)
    store.remove('api')
    expect(store.readAll()).toEqual([])
  })
})
