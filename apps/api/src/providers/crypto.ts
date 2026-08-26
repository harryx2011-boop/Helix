import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * AES-256-GCM for stored provider keys.
 *
 * The encryption key comes from `HELIX_ENCRYPTION_KEY` (32 raw bytes, as hex or
 * base64) or, unset, is derived as SHA-256 of `HELIX_BOOTSTRAP_KEY` — self-host
 * stays zero-config, since every instance already sets the bootstrap key.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Falls back to a random, process-local key when neither `HELIX_ENCRYPTION_KEY`
 * nor `HELIX_BOOTSTRAP_KEY` is set, the same way an instance with no bootstrap
 * key still boots and simply rejects every request rather than crashing — a
 * stored provider key just will not decrypt across a restart in that state.
 */
export function deriveEncryptionKey(encryptionKey: string | undefined, bootstrapKey: string | undefined): Buffer {
  if (encryptionKey) {
    const hex = /^[0-9a-f]{64}$/i.test(encryptionKey) ? Buffer.from(encryptionKey, 'hex') : undefined;
    const b64 = hex ? undefined : Buffer.from(encryptionKey, 'base64');
    const key = hex ?? b64;
    if (!key || key.length !== 32) {
      throw new Error('HELIX_ENCRYPTION_KEY must be 32 bytes, as hex (64 chars) or base64.');
    }
    return key;
  }
  if (!bootstrapKey) {
    return createHash('sha256').update(randomUUID()).digest();
  }
  return createHash('sha256').update(bootstrapKey).digest();
}

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
}

/** Encrypts `plaintext`. The GCM auth tag is appended to the ciphertext. */
export function encryptSecret(plaintext: string, key: Buffer): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([encrypted, tag]), iv };
}

export function decryptSecret(ciphertext: Buffer, iv: Buffer, key: Buffer): string {
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function last4(plaintext: string): string {
  return plaintext.slice(-4);
}
