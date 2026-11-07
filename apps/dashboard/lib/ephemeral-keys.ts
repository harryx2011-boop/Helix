'use client';


const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_LENGTH = 32;

export function generateEphemeralKey(): string {
  const limit = 256 - (256 % ALPHABET.length);
  let key = '';
  const buffer = new Uint8Array(KEY_LENGTH * 2);

  while (key.length < KEY_LENGTH) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte >= limit) continue;
      key += ALPHABET[byte % ALPHABET.length];
      if (key.length === KEY_LENGTH) break;
    }
  }

  return key;
}
