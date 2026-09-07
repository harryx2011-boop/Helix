import { vulcanEnabled } from '@/lib/vulcan/gate';
import { VulcanClient } from './vulcan-client';
import { VulcanLocked } from './vulcan-locked';

export default async function VulcanPage() {
  return (await vulcanEnabled()) ? <VulcanClient /> : <VulcanLocked />;
}
