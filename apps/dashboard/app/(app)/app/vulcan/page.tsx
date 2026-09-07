import { notFound } from 'next/navigation';
import { vulcanEnabled } from '@/lib/vulcan/gate';
import { VulcanClient } from './vulcan-client';

export default async function VulcanPage() {
  if (!(await vulcanEnabled())) notFound();
  return <VulcanClient />;
}
