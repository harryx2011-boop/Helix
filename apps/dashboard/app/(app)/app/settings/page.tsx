import { PageFrame } from '@/components/app/page-frame';
import { AccountPanel } from '@/components/app/settings/account-panel';
import { DangerZonePanel } from '@/components/app/settings/danger-zone-panel';
import { InstanceSettingsPanel } from '@/components/app/settings/instance-settings-panel';
import { PreferencesPanel } from '@/components/app/settings/preferences-panel';
import { UsagePanel } from '@/components/app/settings/usage-panel';
import { ProvidersPanel } from '@/components/app/providers/providers-panel';
import { AsciiFlow } from '@/components/marketing/ascii-fields';
import { HOSTED } from '@/lib/mode';

/**
 * Account sections render in hosted mode only.
 *
 * Self-host has no accounts at all — the browser holds an instance key and
 * there is no profile, no Clerk user and nothing for "delete account" to mean.
 * Rendering them there would show a signed-out visitor a panel that can only
 * ever fail, so they are omitted rather than disabled.
 */
export default function SettingsPage() {
  return (
    <PageFrame>
      <div className="relative flex h-44 flex-col justify-center overflow-hidden px-6">
        <AsciiFlow
          cols={60}
          rows={12}
          seed={12}
          tone="app"
          className="absolute right-0 top-1/2 hidden -translate-y-1/2 lg:block [mask-image:linear-gradient(to_right,transparent,black_40%,black_90%,transparent)]"
        />
        <h1 className="relative text-[32px] font-medium leading-tight tracking-tight text-foreground">Settings</h1>
        <p className="relative mt-1 text-sm text-muted-foreground">
          {HOSTED
            ? 'Your account, what you have used, and this instance’s configuration.'
            : 'This instance’s configuration. The environment supplies the defaults; a change here overrides one.'}
        </p>
      </div>
      {HOSTED && <AccountPanel />}
      <PreferencesPanel />
      {HOSTED && <UsagePanel />}
      <ProvidersPanel />
      <InstanceSettingsPanel />
      {HOSTED && <DangerZonePanel />}
    </PageFrame>
  );
}
