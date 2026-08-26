import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { decryptSecret, encryptSecret } from '../providers/crypto.js';

/**
 * Encryption-key rotation.
 *
 * Rotating `HELIX_ENCRYPTION_KEY` used to be unrecoverable: `decryptSecret`
 * takes one key, the rows carried no marker saying which key encrypted them,
 * and a new key therefore turned every stored provider key into undecryptable
 * bytes. Nothing warned anyone, because nothing reads a provider key until a
 * caller makes an LLM-backed request.
 *
 * Rotation now re-encrypts every row inside one transaction. Every row is
 * decrypted with the old key and re-encrypted with the new one before anything
 * is committed, so a wrong old key aborts the whole rotation with nothing
 * written rather than destroying half the table.
 */

export interface RotationResult {
  rotated: number;
  fromVersion: number;
  toVersion: number;
}

export class RotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RotationError';
  }
}

/** Identifies a key without revealing it, so a version row is auditable. */
export function fingerprint(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export async function currentVersion(): Promise<number> {
  const { rows } = await getPool().query<{ version: number }>(
    'SELECT version FROM encryption_key_versions WHERE retired_at IS NULL ORDER BY version DESC LIMIT 1',
  );
  return rows[0]?.version ?? 1;
}

export async function rotateEncryptionKey(oldKey: Buffer, newKey: Buffer): Promise<RotationResult> {
  if (oldKey.equals(newKey)) {
    throw new RotationError('The new encryption key is identical to the current one.');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const from = await (async () => {
      const { rows } = await client.query<{ version: number }>(
        'SELECT version FROM encryption_key_versions WHERE retired_at IS NULL ORDER BY version DESC LIMIT 1',
      );
      return rows[0]?.version ?? 1;
    })();
    const to = from + 1;

    const { rows } = await client.query<{
      api_key_id: string;
      provider: string;
      key_ciphertext: Buffer;
      key_iv: Buffer;
    }>('SELECT api_key_id, provider, key_ciphertext, key_iv FROM provider_keys WHERE key_version = $1 FOR UPDATE', [
      from,
    ]);

    // Decrypt everything before writing anything: a wrong old key must fail the
    // rotation, not leave the table split across two keys.
    const reEncrypted = rows.map((row) => {
      let plaintext: string;
      try {
        plaintext = decryptSecret(row.key_ciphertext, row.key_iv, oldKey);
      } catch {
        throw new RotationError(
          'The current encryption key does not decrypt the stored provider keys. Nothing was changed.',
        );
      }
      return { row, ...encryptSecret(plaintext, newKey) };
    });

    for (const { row, ciphertext, iv } of reEncrypted) {
      await client.query(
        `UPDATE provider_keys
            SET key_ciphertext = $1, key_iv = $2, key_version = $3, updated_at = now()
          WHERE api_key_id = $4 AND provider = $5`,
        [ciphertext, iv, to, row.api_key_id, row.provider],
      );
    }

    await client.query('UPDATE encryption_key_versions SET retired_at = now() WHERE version = $1', [from]);
    await client.query(
      `INSERT INTO encryption_key_versions (version, fingerprint) VALUES ($1, $2)
       ON CONFLICT (version) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, retired_at = NULL`,
      [to, fingerprint(newKey)],
    );

    await client.query('COMMIT');
    return { rotated: reEncrypted.length, fromVersion: from, toVersion: to };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
