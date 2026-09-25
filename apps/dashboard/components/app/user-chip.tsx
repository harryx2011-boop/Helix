'use client';

import { KeyMenu } from '@/components/shell/key-menu';

/** The app has no accounts, only a stored key, so the chip is the KeyMenu. */
export function UserChip({ collapsed }: { collapsed: boolean }) {
  return <div className="px-1">{collapsed ? null : <KeyMenu />}</div>;
}
