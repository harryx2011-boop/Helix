import { HOSTED } from '@/lib/mode';
import { PlaceholderScreen } from '@/components/shell/placeholder-screen';
import { requireOnboardedProfile } from '@/lib/session';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  if (!HOSTED) {
    return (
      <PlaceholderScreen title="Settings" note="Self-host settings live alongside the instance's own configuration; this screen is hosted-only." />
    );
  }

  const profile = await requireOnboardedProfile();
  return <SettingsClient profile={profile} />;
}
