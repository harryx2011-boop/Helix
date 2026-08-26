import { HOSTED } from '@/lib/mode';
import { PageFrame, FrameRow } from '@/components/app/page-frame';
import { PlaceholderScreen } from '@/components/shell/placeholder-screen';
import { requireOnboardedProfile } from '@/lib/session';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  if (!HOSTED) {
    return (
      <PageFrame>
        <FrameRow flush className="flex min-h-full flex-col">
          <div className="flex h-44 flex-col justify-center px-6">
            <h1 className="text-[32px] font-medium leading-tight tracking-tight text-foreground">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">Self-host settings live in the instance configuration; this screen is hosted-only.</p>
          </div>
          <div className="flex flex-1 items-center justify-center border-t border-border p-6">
            <PlaceholderScreen title="Settings" note="Self-host settings live alongside the instance's own configuration; this screen is hosted-only." />
          </div>
        </FrameRow>
      </PageFrame>
    );
  }

  const profile = await requireOnboardedProfile();
  return <SettingsClient profile={profile} />;
}
