import { HOSTED } from '@/lib/mode';
import { PlaceholderScreen } from '@/components/shell/placeholder-screen';
import { KeysClient } from './keys-client';

export default function KeysPage() {
  if (!HOSTED) {
    return (
      <PlaceholderScreen
        title="Keys"
        note="Self-host keys are managed on the instance's own Postgres via /v1/keys; that screen lands with the self-host workflow."
      />
    );
  }

  return <KeysClient />;
}
