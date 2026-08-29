import { PageFrame } from '@/components/app/page-frame';
import { InstanceSettingsPanel } from '@/components/app/settings/instance-settings-panel';

export default function SettingsPage() {
  return (
    <PageFrame>
      <div className="flex h-44 flex-col justify-center px-6">
        <h1 className="text-[32px] font-medium leading-tight tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This instance&apos;s configuration. The environment supplies the defaults; a change here overrides one.
        </p>
      </div>
      <InstanceSettingsPanel />
    </PageFrame>
  );
}
