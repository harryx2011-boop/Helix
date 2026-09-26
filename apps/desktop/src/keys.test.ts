import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateSecrets, loadOrCreateSecrets, type Cipher } from './keys'

const xor = (b: Buffer) => Buffer.from(b.map((x) => x ^ 0x5a))
const cipher = (available = true): Cipher => ({
  available: () => available,
  encrypt: (s) => xor(Buffer.from(s, 'utf8')),
  decrypt: (b) => xor(b).toString('utf8'),
})
let counter = 0
const rand = (n: number) => Buffer.alloc(n, ++counter)

describe('secrets', () => {
  let dir = ''
  let file = ''
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-keys-'))
    file = path.join(dir, 'credentials.json')
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('generates helix- plus 32 hex and a separate 64-hex admin token', () => {
    const s = generateSecrets()
    expect(s.apiKey).toMatch(/^helix-[0-9a-f]{32}$/)
    expect(s.adminToken).toMatch(/^[0-9a-f]{64}$/)
    expect(s.adminToken).not.toContain(s.apiKey.slice(6))
  })

  it('stores encrypted on first run and returns the same secrets later', () => {
    const first = loadOrCreateSecrets(file, cipher(), () => {}, rand)
    const raw = fs.readFileSync(file, 'utf8')
    expect(JSON.parse(raw).enc).toBe('safeStorage')
    expect(raw).not.toContain(first.apiKey)
    expect(raw).not.toContain(first.adminToken)
    expect(loadOrCreateSecrets(file, cipher(), () => {}, rand)).toEqual(first)
  })

  it('moves an unreadable file aside and generates new secrets', () => {
    fs.writeFileSync(file, '{"v":1,"enc":"safeStorage","apiKey":"AAAA","adminToken":"AAAA"}')
    const logs: string[] = []
    const s = loadOrCreateSecrets(file, cipher(), (m) => logs.push(m), rand, () => 123)
    expect(s.apiKey).toMatch(/^helix-/)
    expect(fs.existsSync(`${file}.unreadable-123`)).toBe(true)
    expect(logs.join()).toContain('moved to')
  })

  it('stores without OS encryption when it is unavailable, and says so', () => {
    const logs: string[] = []
    const s = loadOrCreateSecrets(file, cipher(false), (m) => logs.push(m), rand)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).enc).toBe('plain')
    expect(logs.join()).toContain('unavailable')
    expect(loadOrCreateSecrets(file, cipher(false), () => {}, rand)).toEqual(s)
  })
})
