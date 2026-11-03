import { createDecipheriv } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { decode, loadOrCreateSecrets, type Cipher, type CredentialFile } from '../keys'
import type { Secrets } from '../children/types'

/**
 * The API key is also the root of the encryption key for provider keys stored in the
 * database (HELIX_ENCRYPTION_KEY unset derives it from the bootstrap key), so the
 * browser app must run with the key the Electron app made. Those credentials are sealed
 * by Electron's safeStorage: an AES-256-GCM key wrapped by Windows DPAPI in `Local State`.
 * This reads them; it never writes to or moves the Electron files.
 */

export interface Dpapi {
  protect(data: Buffer): Buffer
  unprotect(data: Buffer): Buffer
}

const PS_ARGS = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command']
const PS_PREFIX = 'Add-Type -AssemblyName System.Security; $in = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); '
const PS_SUFFIX = ", $null, 'CurrentUser'); [Convert]::ToBase64String($out)"

function viaPowershell(method: 'Protect' | 'Unprotect', data: Buffer): Buffer {
  const script = `${PS_PREFIX}$out = [Security.Cryptography.ProtectedData]::${method}($in${PS_SUFFIX}`
  const out = execFileSync('powershell.exe', [...PS_ARGS, script], { input: data.toString('base64'), windowsHide: true, timeout: 20_000 })
  return Buffer.from(out.toString('utf8').trim(), 'base64')
}

/** Windows DPAPI for the current user, through PowerShell so no native addon is needed. */
export const windowsDpapi: Dpapi = {
  protect: (d) => viaPowershell('Protect', d),
  unprotect: (d) => viaPowershell('Unprotect', d),
}

const DPAPI_TAG = Buffer.from('DPAPI')
const V10 = Buffer.from('v10')

/** Electron's `v10` value: nonce (12) + ciphertext + GCM tag (16). */
export function electronCipher(key: Buffer): Cipher {
  return {
    available: () => false,
    encrypt: () => {
      throw new Error('read-only: the Electron credential store is never written by the browser app')
    },
    decrypt(data) {
      if (data.length < V10.length + 12 + 16 || !data.subarray(0, V10.length).equals(V10)) throw new Error('not a v10 value')
      const nonce = data.subarray(3, 15)
      const tag = data.subarray(data.length - 16)
      const body = data.subarray(15, data.length - 16)
      const d = createDecipheriv('aes-256-gcm', key, nonce)
      d.setAuthTag(tag)
      return Buffer.concat([d.update(body), d.final()]).toString('utf8')
    },
  }
}

function electronKey(localState: string, dpapi: Dpapi): Buffer {
  const wrapped = Buffer.from(JSON.parse(fs.readFileSync(localState, 'utf8')).os_crypt.encrypted_key as string, 'base64')
  if (!wrapped.subarray(0, DPAPI_TAG.length).equals(DPAPI_TAG)) throw new Error('Local State key is not DPAPI-wrapped')
  const key = dpapi.unprotect(wrapped.subarray(DPAPI_TAG.length))
  if (key.length !== 32) throw new Error('Local State key has the wrong length')
  return key
}

function dpapiCipher(dpapi: Dpapi): Cipher {
  return {
    available: () => true,
    encrypt: (s) => dpapi.protect(Buffer.from(s, 'utf8')),
    decrypt: (b) => dpapi.unprotect(b).toString('utf8'),
  }
}

export interface WebSecretsInput {
  /** The Electron app's data folder, normally %APPDATA%\Helix. Read only. */
  userData: string
  /** The browser app's own folder for anything it has to write. */
  webDir: string
  dpapi: Dpapi
  log: (msg: string) => void
}

export function loadWebSecrets(i: WebSecretsInput): Secrets {
  const file = path.join(i.userData, 'credentials.json')
  if (fs.existsSync(file)) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as CredentialFile
      const cipher = stored.enc === 'safeStorage' ? electronCipher(electronKey(path.join(i.userData, 'Local State'), i.dpapi)) : dpapiCipher(i.dpapi)
      return decode(stored, cipher)
    } catch (e) {
      // A new key would orphan the provider keys already stored in the database, so stop instead.
      throw new Error(`Could not read the stored Helix credentials in ${file} (${e instanceof Error ? e.message : String(e)}). Nothing was changed.`)
    }
  }
  return loadOrCreateSecrets(path.join(i.webDir, 'credentials.json'), dpapiCipher(i.dpapi), i.log)
}
