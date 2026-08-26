import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret, decryptSecret } from '../providers/crypto.js';

/**
 * Rotation is the one operation here that can destroy data: a wrong old key
 * turns every stored provider key into bytes nobody can read. These tests hold
 * the line that a failed rotation writes nothing.
 */

interface Row {
  api_key_id: string;
  provider: string;
  key_ciphertext: Buffer;
  key_iv: Buffer;
}

const db = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    statements: [] as string[],
    updates: [] as unknown[][],
    version: 1,
  };
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    state.statements.push(text.trim().split('\n')[0]!.trim());
    if (text.includes('FROM encryption_key_versions')) {
      return { rows: [{ version: state.version }], rowCount: 1 };
    }
    if (text.includes('FROM provider_keys')) {
      return { rows: state.rows, rowCount: state.rows.length };
    }
    if (text.includes('UPDATE provider_keys')) {
      state.updates.push(values);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  return { state, query, client };
});

vi.mock('../db/pool.js', () => ({
  getPool: () => ({ query: db.query, connect: async () => db.client }),
}));

import { rotateEncryptionKey, RotationError, fingerprint } from './rotate.js';

const OLD = Buffer.alloc(32, 1);
const NEW = Buffer.alloc(32, 2);

function storedRow(plaintext: string, key: Buffer): Row {
  const { ciphertext, iv } = encryptSecret(plaintext, key);
  return { api_key_id: 'key-1', provider: 'openai', key_ciphertext: ciphertext, key_iv: iv };
}

beforeEach(() => {
  db.state.rows = [];
  db.state.statements = [];
  db.state.updates = [];
  db.state.version = 1;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('rotateEncryptionKey', () => {
  it('refuses to rotate to the key already in use', async () => {
    await expect(rotateEncryptionKey(OLD, OLD)).rejects.toThrow(RotationError);
  });

  it('re-encrypts every stored key so the new key can read it', async () => {
    db.state.rows = [storedRow('sk-secret-value', OLD)];

    const result = await rotateEncryptionKey(OLD, NEW);

    expect(result).toMatchObject({ rotated: 1, fromVersion: 1, toVersion: 2 });
    const [ciphertext, iv] = db.state.updates[0] as [Buffer, Buffer];
    expect(decryptSecret(ciphertext, iv, NEW)).toBe('sk-secret-value');
  });

  it('commits once every row re-encrypted successfully', async () => {
    db.state.rows = [storedRow('a-key', OLD), storedRow('b-key', OLD)];

    await rotateEncryptionKey(OLD, NEW);

    expect(db.state.statements).toContain('COMMIT');
    expect(db.state.statements).not.toContain('ROLLBACK');
  });

  it('rolls back and writes nothing when the old key does not decrypt a row', async () => {
    const wrongKey = Buffer.alloc(32, 9);
    db.state.rows = [storedRow('unreadable', wrongKey)];

    await expect(rotateEncryptionKey(OLD, NEW)).rejects.toThrow(RotationError);

    expect(db.state.updates).toHaveLength(0);
    expect(db.state.statements).toContain('ROLLBACK');
    expect(db.state.statements).not.toContain('COMMIT');
  });

  it('does not partially rewrite when a later row fails', async () => {
    const wrongKey = Buffer.alloc(32, 9);
    db.state.rows = [storedRow('readable', OLD), storedRow('unreadable', wrongKey)];

    await expect(rotateEncryptionKey(OLD, NEW)).rejects.toThrow(RotationError);

    // The first row decrypts fine; nothing may be written because the second does not.
    expect(db.state.updates).toHaveLength(0);
  });

  it('rotates an empty table without error', async () => {
    const result = await rotateEncryptionKey(OLD, NEW);

    expect(result.rotated).toBe(0);
    expect(db.state.statements).toContain('COMMIT');
  });
});

describe('fingerprint', () => {
  it('identifies a key without revealing it', () => {
    const print = fingerprint(OLD);

    expect(print).toHaveLength(16);
    expect(print).not.toContain(OLD.toString('hex'));
    expect(fingerprint(OLD)).toBe(print);
    expect(fingerprint(NEW)).not.toBe(print);
  });
});
