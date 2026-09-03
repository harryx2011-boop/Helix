import * as React from 'react';
import { getRoles } from '@/lib/catalog';
import { Sidebar } from '@/components/app/sidebar';
import { MobileSidebar } from '@/components/app/mobile-sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const roles = await getRoles();

  return (
    <div className="flex min-h-screen bg-p-bg">
      <React.Suspense fallback={null}>
        <Sidebar roles={roles} />
      </React.Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <React.Suspense fallback={null}>
          <MobileSidebar roles={roles} />
        </React.Suspense>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
