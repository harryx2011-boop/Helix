'use client';

import { UserButton, useUser } from '@clerk/nextjs';
import { KeyMenu } from '@/components/shell/key-menu';
import { HOSTED } from '@/lib/mode';

/**
 * Hosted: Clerk's UserButton with the email alongside. Self-host: the
 * existing KeyMenu (the app has no accounts there, only a stored key).
 */
export function UserChip({ collapsed }: { collapsed: boolean }) {
  if (!HOSTED) return <div className="px-1">{collapsed ? null : <KeyMenu />}</div>;
  return <HostedUserChip collapsed={collapsed} />;
}

function HostedUserChip({ collapsed }: { collapsed: boolean }) {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  return (
    <div className="flex items-center gap-2 px-1.5 py-1">
      <UserButton
        appearance={{
          elements: { userButtonAvatarBox: 'h-7 w-7' },
        }}
      />
      {!collapsed && <span className="truncate text-xs text-muted-foreground">{email}</span>}
    </div>
  );
}
