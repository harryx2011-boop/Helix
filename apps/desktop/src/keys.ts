import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Secrets } from './children/types'

export interface Cipher {
  available(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

interface CredentialFile {
  v: 1
  enc: 'safeStorage' | 'plain'
  apiKey: string
  adminToken: string
}

export type Random = (bytes: number) => Buffer

export function generateSecrets(rand: Random = randomBytes): Secrets {
  return { apiKey: `helix-${rand(16).toString('hex')}`, adminToken: rand(32).toString('hex') }
}

const KEY_SHAPE = /^helix-[0-9a-f]{32}$/
const TOKEN_SHAPE = /^[0-9a-f]{64}$/

function decode(file: CredentialFile, cipher: Cipher): Secrets {
  const read = (v: string) => (file.enc === 'safeStorage' ? cipher.decrypt(Buffer.from(v, 'base64')) : Buffer.from(v, 'base64').toString('utf8'))
  const secrets = { apiKey: read(file.apiKey), adminToken: read(file.adminToken) }
  if (!KEY_SHAPE.test(secrets.apiKey) || !TOKEN_SHAPE.test(secrets.adminToken)) throw new Error('credentials have the wrong shape')
  return secrets
}

function encode(secrets: Secrets, cipher: Cipher): CredentialFile {
  const secure = cipher.available()
  const write = (v: string) => (secure ? cipher.encrypt(v) : Buffer.from(v, 'utf8')).toString('base64')
  return { v: 1, enc: secure ? 'safeStorage' : 'plain', apiKey: write(secrets.apiKey), adminToken: write(secrets.adminToken) }
}

/**
 * Reads the stored key and admin token, or makes and stores them on first run.
 * An unreadable file is moved aside, never overwritten, so the old secrets stay recoverable.
 */
export function loadOrCreateSecrets(file: string, cipher: Cipher, log: (m: string) => void, rand: Random = randomBytes, now = Date.now): Secrets {
  if (fs.existsSync(file)) {
    try {
      return decode(JSON.parse(fs.readFileSync(file, 'utf8')) as CredentialFile, cipher)
    } catch (e) {
      const aside = `${file}.unreadable-${now()}`
      fs.renameSync(file, aside)
      log(`credentials: could not read ${file} (${String(e)}); moved to ${aside} and generated new ones`)
    }
  }
  const secrets = generateSecrets(rand)
  const stored = encode(secrets, cipher)
  if (stored.enc === 'plain') log('credentials: OS encryption unavailable, stored without it')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(stored), { mode: 0o600 })
  return secrets
}
