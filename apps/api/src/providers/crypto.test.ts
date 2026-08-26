import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, deriveEncryptionKey, encryptSecret, last4 } from './crypto.js';

describe('deriveEncryptionKey', () => {
  it('accepts a 64-char hex HELIX_ENCRYPTION_KEY', () => {
    const hex = randomBytes(32).toString('hex');
    const key = deriveEncryptionKey(hex, undefined);
    expect(key).toEqual(Buffer.from(hex, 'hex'));
  });

  it('accepts a base64 HELIX_ENCRYPTION_KEY', () => {
    const raw = randomBytes(32);
    const key = deriveEncryptionKey(raw.toString('base64'), undefined);
    expect(key).toEqual(raw);
  });

  it('rejects a HELIX_ENCRYPTION_KEY that is not 32 bytes', () => {
    expect(() => deriveEncryptionKey('too-short', undefined)).toThrow(/32 bytes/);
  });

  it('derives deterministically from HELIX_BOOTSTRAP_KEY when unset', () => {
    const a = deriveEncryptionKey(undefined, 'my-bootstrap-key');
    const b = deriveEncryptionKey(undefined, 'my-bootstrap-key');
    expect(a).toEqual(b);
    expect(a).toEqual(createHash('sha256').update('my-bootstrap-key').digest());
  });

  it('derives a different key for a different bootstrap key', () => {
    const a = deriveEncryptionKey(undefined, 'key-one');
    const b = deriveEncryptionKey(undefined, 'key-two');
    expect(a).not.toEqual(b);
  });

  it('does not throw when neither is set', () => {
    expect(() => deriveEncryptionKey(undefined, undefined)).not.toThrow();
  });
});

describe('encryptSecret / decryptSecret round trip', () => {
  const key = deriveEncryptionKey(undefined, 'test-bootstrap');

  it('recovers the original plaintext', () => {
    const { ciphertext, iv } = encryptSecret('sk-ant-abc123xyz', key);
    expect(decryptSecret(ciphertext, iv, key)).toBe('sk-ant-abc123xyz');
  });

  it('never stores the plaintext inside the ciphertext', () => {
    const plaintext = 'sk-ant-abc123xyz';
    const { ciphertext } = encryptSecret(plaintext, key);
    expect(ciphertext.toString('base64')).not.toContain(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-secret', key);
    const b = encryptSecret('same-secret', key);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('fails to decrypt with the wrong key', () => {
    const { ciphertext, iv } = encryptSecret('sk-ant-abc123xyz', key);
    const wrongKey = deriveEncryptionKey(undefined, 'a-different-bootstrap');
    expect(() => decryptSecret(ciphertext, iv, wrongKey)).toThrow();
  });

  it('fails to decrypt a tampered ciphertext (auth tag mismatch)', () => {
    const { ciphertext, iv } = encryptSecret('sk-ant-abc123xyz', key);
    const tampered = Buffer.from(ciphertext);
    tampered[0] = tampered[0]! ^ 0xff;
    expect(() => decryptSecret(tampered, iv, key)).toThrow();
  });
});

describe('last4', () => {
  it('returns the last 4 characters', () => {
    expect(last4('sk-ant-abcd1234')).toBe('1234');
  });

  it('handles strings shorter than 4 characters', () => {
    expect(last4('ab')).toBe('ab');
  });
});
