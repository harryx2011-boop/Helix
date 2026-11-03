import { createCipheriv, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateSecrets } from '../keys'
import { electronCipher, loadWebSecrets, type Dpapi } from './secrets'

// A reversible stand-in for Windows DPAPI.
const fakeDpapi: Dpapi = {
  protect: (b) => Buffer.from(b).reverse(),
  unprotect: (b) => Buffer.from(b).reverse(),
}

function sealLikeElectron(plain: string, key: Buffer): Buffer {
  const nonce = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([Buffer.from('v10'), nonce, body, c.getAuthTag()])
}

let dir: string
const log = () => {}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-web-secrets-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function writeElectronState(userData: string, key: Buffer, secrets = generateSecrets()) {
  const wrapped = Buffer.concat([Buffer.from('DPAPI'), fakeDpapi.protect(key)])
  fs.writeFileSync(path.join(userData, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: wrapped.toString('base64') } }))
  const enc = (s: string) => sealLikeElectron(s, key).toString('base64')
  fs.writeFileSync(
    path.join(userData, 'credentials.json'),
    JSON.stringify({ v: 1, enc: 'safeStorage', apiKey: enc(secrets.apiKey), adminToken: enc(secrets.adminToken) }),
  )
  return secrets
}

describe('web secrets', () => {
  it('S1: reads the credentials the Electron app stored, so the same key stays valid', () => {
    const userData = path.join(dir, 'Helix')
    fs.mkdirSync(userData)
    const secrets = writeElectronState(userData, randomBytes(32))
    expect(loadWebSecrets({ userData, webDir: path.join(dir, 'web'), dpapi: fakeDpapi, log })).toEqual(secrets)
  })

  it('S2: the Electron credentials file is never rewritten or moved', () => {
    const userData = path.join(dir, 'Helix')
    fs.mkdirSync(userData)
    writeElectronState(userData, randomBytes(32))
    const before = fs.readFileSync(path.join(userData, 'credentials.json'))
    loadWebSecrets({ userData, webDir: path.join(dir, 'web'), dpapi: fakeDpapi, log })
    expect(fs.readFileSync(path.join(userData, 'credentials.json'))).toEqual(before)
    expect(fs.readdirSync(userData).sort()).toEqual(['Local State', 'credentials.json'])
  })

  it('S3: unreadable Electron credentials stop the launch instead of minting a new key', () => {
    const userData = path.join(dir, 'Helix')
    fs.mkdirSync(userData)
    writeElectronState(userData, randomBytes(32))
    fs.writeFileSync(path.join(userData, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: Buffer.from('DPAPI' + 'xxxx').toString('base64') } }))
    expect(() => loadWebSecrets({ userData, webDir: path.join(dir, 'web'), dpapi: fakeDpapi, log })).toThrow(/credentials/i)
    expect(fs.existsSync(path.join(dir, 'web'))).toBe(false)
  })

  it('S4: with no Electron install, new secrets are made once and kept DPAPI-protected', () => {
    const userData = path.join(dir, 'Helix')
    const webDir = path.join(dir, 'web')
    fs.mkdirSync(userData)
    const first = loadWebSecrets({ userData, webDir, dpapi: fakeDpapi, log })
    const second = loadWebSecrets({ userData, webDir, dpapi: fakeDpapi, log })
    expect(second).toEqual(first)
    expect(fs.readFileSync(path.join(webDir, 'credentials.json'), 'utf8')).not.toContain(first.apiKey)
  })

  it('S5: electronCipher refuses a value that is not v10', () => {
    const c = electronCipher(randomBytes(32))
    expect(() => c.decrypt(Buffer.from('v11abcdefghijklmnopqrstuvwxyz0123456789'))).toThrow()
  })
})
