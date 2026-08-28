'use client';

/**
 * Stateless key generation for deployments with no key store.
 *
 * The hosted demo on Vercel has no Supabase behind it, so there is nothing to
 * persist a key into and no account to attribute one to. Rather than disable
 * the page, mint the key in the browser and show it once: nothing is sent to a
 * server, nothing is stored, and no record of it exists anywhere afterwards.
 *
 * A key only becomes real when the operator adds it to their own instance —
 * `POST /internal/keys` mirrors one in, or HELIX_BOOTSTRAP_KEY sets it at boot.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KEY_LENGTH = 32;

/**
 * 32 chars from a 62-symbol alphabet (~190 bits). Uses the browser CSPRNG and
 * rejects biased draws rather than taking `% ALPHABET.length`, which would
 * favour the first 8 letters.
 */
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
