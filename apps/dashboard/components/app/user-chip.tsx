'use client';

import { KeyMenu } from '@/components/shell/key-menu';

export function UserChip({ collapsed }: { collapsed: boolean }) {
  return <div className="px-1">{collapsed ? null : <KeyMenu />}</div>;
}
