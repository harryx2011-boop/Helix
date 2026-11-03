import { getPool } from '../db/pool.js';
import { settingDef, SETTINGS, type Effect } from './registry.js';


export interface StoredSetting {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
}

export interface SettingView extends StoredSetting {
  env: string;
  effect: Effect;
  description: string;
  warning?: string | undefined;
  envValue: unknown;
  overridden: boolean;
}

export async function readOverrides(): Promise<Map<string, unknown>> {
  const { rows } = await getPool().query<{ key: string; value: unknown }>(
    'SELECT key, value FROM instance_settings',
  );
  const out = new Map<string, unknown>();
  for (const row of rows) {
    if (settingDef(row.key)) out.set(row.key, row.value);
  }
  return out;
}

export async function writeOverride(key: string, value: unknown, updatedBy: string | null): Promise<void> {
  await getPool().query(
    `INSERT INTO instance_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), updatedBy],
  );
}

export async function clearOverride(key: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM instance_settings WHERE key = $1', [key]);
  return (rowCount ?? 0) > 0;
}

export async function listSettings(envValues: Record<string, unknown>): Promise<SettingView[]> {
  const overrides = await readOverrides();
  const { rows } = await getPool().query<{ key: string; updated_at: Date; updated_by: string | null }>(
    'SELECT key, updated_at, updated_by FROM instance_settings',
  );
  const meta = new Map(rows.map((r) => [r.key, r]));

  return SETTINGS.map((def) => {
    const overridden = overrides.has(def.key);
    const row = meta.get(def.key);
    return {
      key: def.key,
      env: def.env,
      effect: def.effect,
      description: def.description,
      warning: def.warning,
      value: overridden ? overrides.get(def.key) : envValues[def.key],
      envValue: envValues[def.key],
      overridden,
      updatedAt: row ? row.updated_at.toISOString() : '',
      updatedBy: row?.updated_by ?? null,
    };
  });
}
