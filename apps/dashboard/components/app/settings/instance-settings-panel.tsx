'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { RotateCcw } from '@/components/icons/lucide';
import { FrameRow, FrameHeading } from '@/components/app/page-frame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  clearInstanceSetting,
  getAdminToken,
  listInstanceSettings,
  saveInstanceSetting,
  setAdminToken,
  SettingsError,
  type InstanceSetting,
} from '@/lib/instance-settings';

const GROUPS = [
  { id: 'live', title: 'Takes Effect Immediately', description: 'The next request uses the new value.' },
  { id: 'restart', title: 'Takes Effect After a Restart', description: 'Saved now, and used the next time the server starts.' },
  { id: 'guarded', title: 'Changes What the Server Can Reach', description: 'These affect security, so each one asks you to confirm before it saves.' },
] as const;

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseLike(sample: unknown, raw: string): unknown {
  if (Array.isArray(sample)) {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (typeof sample === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

function EffectBadge({ effect }: { effect: InstanceSetting['effect'] }) {
  return (
    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
      {effect === 'live' ? '[ live ]' : effect === 'guarded' ? '[ guarded ]' : '[ restart ]'}
    </span>
  );
}

function BooleanSetting({
  setting,
  onSaved,
}: {
  setting: InstanceSetting;
  onSaved: (next: Partial<InstanceSetting>) => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const checked = Boolean(setting.value);

  const commit = async (next: boolean) => {
    setSaving(true);
    try {
      // A guarded setting is refused without a confirmation naming it. Asking
      // here keeps the decision at the moment of the change rather than behind
      // a mode the operator might forget they left on.
      const confirm =
        setting.effect === 'guarded' && next && !window.confirm(`${setting.warning ?? ''}\n\nTurn on ${setting.key}?`)
          ? null
          : setting.key;
      if (confirm === null) return;

      const result = await saveInstanceSetting(setting.key, next, setting.effect === 'guarded' ? confirm : undefined);
      onSaved({ value: result.value, overridden: true });
      toast.success(result.restartRequired ? `${setting.key} saved. Restart to apply.` : `${setting.key} applied.`);
    } catch (error) {
      toast.error(error instanceof SettingsError ? error.message : 'Could not save the setting.');
    } finally {
      setSaving(false);
    }
  };

  return <Switch checked={checked} disabled={saving} onCheckedChange={commit} aria-label={setting.key} />;
}

function ValueSetting({
  setting,
  onSaved,
}: {
  setting: InstanceSetting;
  onSaved: (next: Partial<InstanceSetting>) => void;
}) {
  const [draft, setDraft] = React.useState(displayValue(setting.value));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(displayValue(setting.value));
  }, [setting.value]);

  const dirty = draft !== displayValue(setting.value);

  const commit = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const result = await saveInstanceSetting(setting.key, parseLike(setting.envValue, draft));
      onSaved({ value: result.value, overridden: true });
      toast.success(result.restartRequired ? `${setting.key} saved. Restart to apply.` : `${setting.key} applied.`);
    } catch (error) {
      toast.error(error instanceof SettingsError ? error.message : 'Could not save the setting.');
      setDraft(displayValue(setting.value));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(displayValue(setting.value));
        }}
        onBlur={commit}
        className="h-9 w-44 font-mono text-[13px]"
        aria-label={setting.key}
      />
      {dirty && (
        <Button type="button" size="sm" className="h-9 rounded-pill px-3 text-xs" disabled={saving} onClick={commit}>
          {saving ? 'Saving' : 'Save'}
        </Button>
      )}
    </div>
  );
}

function SettingRow({
  setting,
  onSaved,
  last,
}: {
  setting: InstanceSetting;
  onSaved: (next: Partial<InstanceSetting>) => void;
  last: boolean;
}) {
  const [reverting, setReverting] = React.useState(false);
  const isBoolean = typeof setting.envValue === 'boolean';

  const revert = async () => {
    setReverting(true);
    try {
      await clearInstanceSetting(setting.key);
      onSaved({ value: setting.envValue, overridden: false });
      toast.success(`${setting.key} reverted to the environment value.`);
    } catch (error) {
      toast.error(error instanceof SettingsError ? error.message : 'Could not revert the setting.');
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className={cn('flex items-start justify-between gap-6 px-6 py-4', !last && 'border-b border-border')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-all font-mono text-[13px] text-foreground">{setting.env}</span>
          <EffectBadge effect={setting.effect} />
          {setting.overridden && (
            <button
              type="button"
              onClick={revert}
              disabled={reverting}
              className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              revert
            </button>
          )}
        </div>
        <p className="mt-1 max-w-[60ch] text-[13px] leading-snug text-muted-foreground">{setting.description}</p>
        {setting.overridden && (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            environment: {displayValue(setting.envValue)}
          </p>
        )}
      </div>
      <div className="shrink-0 pt-0.5">
        {isBoolean ? <BooleanSetting setting={setting} onSaved={onSaved} /> : <ValueSetting setting={setting} onSaved={onSaved} />}
      </div>
    </div>
  );
}

function TokenGate({ onSaved }: { onSaved: () => void }) {
  const [draft, setDraft] = React.useState('');

  return (
    <FrameRow flush className="px-6 py-5">
      <p className="max-w-[60ch] text-[13px] leading-snug text-muted-foreground">
        These settings change the server itself, so they need the admin token rather than an API key. Paste the{' '}
        <span className="font-mono text-foreground">HELIX_INTERNAL_ADMIN_TOKEN</span> the server was started with. It
        stays in this browser and is never sent anywhere else.
      </p>
      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setAdminToken(draft.trim());
          onSaved();
        }}
      >
        <Input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Admin token"
          className="h-9 w-full max-w-80 font-mono text-[13px]"
          aria-label="Admin token"
        />
        <Button type="submit" size="sm" className="h-9 rounded-pill px-4 text-xs" disabled={!draft.trim()}>
          Save
        </Button>
      </form>
    </FrameRow>
  );
}

export function InstanceSettingsPanel() {
  const [settings, setSettings] = React.useState<InstanceSetting[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [needsToken, setNeedsToken] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    if (!getAdminToken()) {
      setNeedsToken(true);
      setLoading(false);
      return;
    }
    setNeedsToken(false);
    listInstanceSettings()
      .then((result) => setSettings(result.settings))
      .catch((err: unknown) => {
        if (err instanceof SettingsError && err.status === 401) setNeedsToken(true);
        else setError(err instanceof SettingsError ? err.message : 'Could not load instance settings.');
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const update = React.useCallback((key: string, next: Partial<InstanceSetting>) => {
    setSettings((current) => current?.map((s) => (s.key === key ? { ...s, ...next } : s)) ?? current);
  }, []);

  if (loading) {
    return (
      <FrameRow flush className="flex flex-col gap-3 p-6">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </FrameRow>
    );
  }

  if (needsToken) return <TokenGate onSaved={load} />;

  if (error) {
    return (
      <FrameRow flush className="p-6">
        <p className="text-[13px] leading-snug text-muted-foreground">{error}</p>
      </FrameRow>
    );
  }

  return (
    <>
      {GROUPS.map((group) => {
        const rows = settings?.filter((s) => s.effect === group.id) ?? [];
        if (rows.length === 0) return null;
        return (
          <React.Fragment key={group.id}>
            <FrameRow>
              <FrameHeading
                {...(group.id === 'live' ? { id: 'instance' } : {})}
                title={group.title}
                description={group.description}
              />
            </FrameRow>
            <FrameRow flush>
              {rows.map((setting, index) => (
                <SettingRow
                  key={setting.key}
                  setting={setting}
                  last={index === rows.length - 1}
                  onSaved={(next) => update(setting.key, next)}
                />
              ))}
            </FrameRow>
          </React.Fragment>
        );
      })}
    </>
  );
}
