import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminGate } from '../core/admin-gate.js';
import { settingDef } from '../settings/registry.js';
import { clearOverride, listSettings, writeOverride } from '../settings/store.js';
import { applyLive, type LiveTargets } from '../settings/apply.js';
import { currentVersion, rotateEncryptionKey, RotationError } from '../settings/rotate.js';
import { deriveEncryptionKey } from '../providers/crypto.js';


const UpdateSchema = z.object({
  value: z.unknown(),
  confirm: z.string().optional(),
});

const RotateSchema = z.object({
  newKey: z.string().min(1),
  confirm: z.literal('rotate-encryption-key'),
});

export interface SettingsRouteDeps {
  adminToken: string | undefined;
  envValues: Record<string, unknown>;
  live: LiveTargets;
  encryptionKey: Buffer;
  publicUrl?: string | undefined;
}

export async function registerSettings(app: FastifyInstance, deps: SettingsRouteDeps): Promise<void> {
  if (!deps.adminToken) return;
  const token = deps.adminToken;

  await app.register(
    async (scope) => {
      scope.addHook('onRequest', adminGate({ token, publicUrl: deps.publicUrl }));
      registerSettingsRoutes(scope, deps);
    },
    { prefix: '/settings' },
  );
}

function registerSettingsRoutes(app: FastifyInstance, deps: SettingsRouteDeps): void {
  app.get('/', async (request, reply) => {
    return reply.send({
      success: true,
      settings: await listSettings(deps.envValues),
      encryptionKeyVersion: await currentVersion(),
    });
  });

  app.put('/:key', async (request, reply) => {
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

  app.delete('/:key', async (request, reply) => {
    const key = (request.params as { key: string }).key;
    const def = settingDef(key);
    if (!def) {
      return reply.code(404).send({ error: 'not_found', message: `${key} is not an editable setting.`, requestId: request.id });
    }

    const cleared = await clearOverride(key);
    const applied = cleared && deps.envValues[key] !== undefined ? applyLive(key, deps.envValues[key], deps.live) : false;

    return reply.send({ success: true, key, cleared, applied, restartRequired: cleared && !applied });
  });

  app.post('/encryption-key/rotate', async (request, reply) => {
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
