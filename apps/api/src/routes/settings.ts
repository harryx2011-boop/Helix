import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { safeEqual } from '../core/api-keys.js';
import { settingDef } from '../settings/registry.js';
import { clearOverride, listSettings, writeOverride } from '../settings/store.js';
import { applyLive, type LiveTargets } from '../settings/apply.js';
import { currentVersion, rotateEncryptionKey, RotationError } from '../settings/rotate.js';
import { deriveEncryptionKey } from '../providers/crypto.js';

/**
 * Operator settings for a self-hosted instance.
 *
 * Mounted outside `/v1` and gated by the same admin token as `/internal`,
 * because these are the instance's own controls rather than a caller's: an API
 * key must never be able to widen the instance's network reach or rotate the
 * key protecting everyone's stored credentials. With no admin token set — the
 * self-host default — the routes are not registered at all.
 */

const UpdateSchema = z.object({
  value: z.unknown(),
  /** Required for a `guarded` setting. Names the key, so a blanket `true` cannot slip one through. */
  confirm: z.string().optional(),
});

const RotateSchema = z.object({
  newKey: z.string().min(1),
  confirm: z.literal('rotate-encryption-key'),
});

export interface SettingsRouteDeps {
  adminToken: string | undefined;
  /** The values the environment supplied at boot, shown as the baseline behind each override. */
  envValues: Record<string, unknown>;
  live: LiveTargets;
  encryptionKey: Buffer;
}

export async function registerSettings(app: FastifyInstance, deps: SettingsRouteDeps): Promise<void> {
  if (!deps.adminToken) return;
  const expected = deps.adminToken;

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/settings')) return;
    const presented = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!presented || !safeEqual(presented, expected)) {
      return reply.code(401).send({
        error: 'unauthorized',
        message: 'Missing or invalid admin token.',
        requestId: request.id,
      });
    }
  });

  app.get('/settings', async (request, reply) => {
    return reply.send({
      success: true,
      settings: await listSettings(deps.envValues),
      encryptionKeyVersion: await currentVersion(),
    });
  });

  app.put('/settings/:key', async (request, reply) => {
    const key = (request.params as { key: string }).key;
    const def = settingDef(key);
    if (!def) {
      return reply.code(404).send({
        error: 'not_found',
        message: `${key} is not an editable setting.`,
        requestId: request.id,
      });
    }

    const parsed = UpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request', message: 'body must carry a value', requestId: request.id });
    }

    const value = def.schema.safeParse(parsed.data.value);
    if (!value.success) {
      const first = value.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_request',
        message: first?.message ?? 'invalid value',
        field: 'value',
        requestId: request.id,
      });
    }

    if (def.effect === 'guarded' && parsed.data.confirm !== key) {
      return reply.code(409).send({
        error: 'confirmation_required',
        message: def.warning ?? 'This setting changes the security posture of the instance.',
        confirm: key,
        requestId: request.id,
      });
    }

    await writeOverride(key, value.data, 'settings-api');
    const applied = applyLive(key, value.data, deps.live);

    return reply.send({
      success: true,
      key,
      value: value.data,
      effect: def.effect,
      applied,
      restartRequired: !applied,
    });
  });

  app.delete('/settings/:key', async (request, reply) => {
    const key = (request.params as { key: string }).key;
    const def = settingDef(key);
    if (!def) {
      return reply.code(404).send({ error: 'not_found', message: `${key} is not an editable setting.`, requestId: request.id });
    }

    const cleared = await clearOverride(key);
    // Reverting a live setting must take the environment's value now, not at
    // the next restart, or the screen and the running instance disagree.
    const applied = cleared ? applyLive(key, deps.envValues[key], deps.live) : false;

    return reply.send({ success: true, key, cleared, applied, restartRequired: cleared && !applied });
  });

  app.post('/settings/encryption-key/rotate', async (request, reply) => {
    const parsed = RotateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(409).send({
        error: 'confirmation_required',
        message:
          'Rotating the encryption key re-encrypts every stored provider key. Confirm with "rotate-encryption-key".',
        confirm: 'rotate-encryption-key',
        requestId: request.id,
      });
    }

    let newKey: Buffer;
    try {
      newKey = deriveEncryptionKey(parsed.data.newKey, undefined);
    } catch (error) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'invalid encryption key',
        field: 'newKey',
        requestId: request.id,
      });
    }

    try {
      const result = await rotateEncryptionKey(deps.encryptionKey, newKey);
      // The process still holds the old key in memory. Until HELIX_ENCRYPTION_KEY
      // is updated and the instance restarted, it can no longer read what it
      // just re-encrypted — so say so rather than reporting a clean success.
      return reply.send({
        success: true,
        ...result,
        restartRequired: true,
        message: `Re-encrypted ${result.rotated} stored provider key(s). Set HELIX_ENCRYPTION_KEY to the new value and restart; until then this instance cannot read them.`,
      });
    } catch (error) {
      if (error instanceof RotationError) {
        return reply.code(409).send({ error: 'rotation_failed', message: error.message, requestId: request.id });
      }
      throw error;
    }
  });
}
