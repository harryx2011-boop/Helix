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
  const write = (v: string) => cipher.encrypt(v).toString('base64')
  return { v: 1, enc: 'safeStorage', apiKey: write(secrets.apiKey), adminToken: write(secrets.adminToken) }
}

function store(file: string, secrets: Secrets, cipher: Cipher): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(encode(secrets, cipher)), { mode: 0o600 })
}

/**
 * Reads the stored key and admin token, or makes and stores them on first run.
 * An unreadable file is moved aside, never overwritten, so the old secrets stay recoverable.
 *
 * Secrets are written only under OS encryption: a base64 file is the secret in
 * the clear, and a file mode does not protect it on Windows. Without encryption
 * they live for this launch only. A plain file from an older build is still
 * read, and re-encrypted as soon as encryption is available.
 */
export function loadOrCreateSecrets(file: string, cipher: Cipher, log: (m: string) => void, rand: Random = randomBytes, now = Date.now): Secrets {
  if (fs.existsSync(file)) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as CredentialFile
      const secrets = decode(stored, cipher)
      if (stored.enc === 'plain' && cipher.available()) store(file, secrets, cipher)
      return secrets
    } catch (e) {
      const aside = `${file}.unreadable-${now()}`
      fs.renameSync(file, aside)
      log(`credentials: could not read ${file} (${String(e)}); moved to ${aside} and generated new ones`)
    }
  }
  const secrets = generateSecrets(rand)
  if (!cipher.available()) {
    log('credentials: OS encryption unavailable, so they are kept for this launch only and not written to disk')
    return secrets
  }
  store(file, secrets, cipher)
  return secrets
}
