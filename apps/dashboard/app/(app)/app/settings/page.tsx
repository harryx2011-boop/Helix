import { PageFrame } from '@/components/app/page-frame';
import { InstanceSettingsPanel } from '@/components/app/settings/instance-settings-panel';
import { ProvidersPanel } from '@/components/app/providers/providers-panel';
import { AsciiFlow } from '@/components/marketing/ascii-fields';

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
          This instance&apos;s configuration. The environment supplies the defaults; a change here overrides one.
        </p>
      </div>
      <ProvidersPanel />
      <InstanceSettingsPanel />
    </PageFrame>
  );
}
