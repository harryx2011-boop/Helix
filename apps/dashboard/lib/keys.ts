import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';

/** `helix-` + 16 chars from [A-Za-z0-9] (WEBSITE.md §8). */
export const KEY_PREFIX = 'helix-';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_BODY_LENGTH = 16;

export function generateApiKey(): string {
  let body = '';
  for (let i = 0; i < KEY_BODY_LENGTH; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  return KEY_PREFIX + body;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** `helix-a7K2` — the part safe to show in tables. */
export function keyPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 4);
}

export function keyLast3(key: string): string {
  return key.slice(-3);
}

/** `helix-a7K2………sT1` */
export function maskApiKey(prefix: string, last3: string): string {
  return `${prefix}………${last3}`;
}

export function isApiKeyShape(value: string): boolean {
  return new RegExp(`^${KEY_PREFIX}[A-Za-z0-9]{${KEY_BODY_LENGTH}}$`).test(value);
}

function encryptionKey(): Buffer {
  const raw = process.env.HELIX_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error('HELIX_KEY_ENCRYPTION_KEY is not set (32 bytes, base64)');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('HELIX_KEY_ENCRYPTION_KEY must decode to 32 bytes');
  return buf;
}

/** AES-256-GCM. Ciphertext carries the auth tag appended (16 bytes). */
export function encryptApiKey(key: string): { ciphertext: Buffer; iv: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([enc, cipher.getAuthTag()]), iv };
}

export function decryptApiKey(ciphertext: Buffer, iv: Buffer): string {
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
