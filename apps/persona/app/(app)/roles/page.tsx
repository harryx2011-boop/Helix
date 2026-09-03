import * as React from 'react';
import type { Metadata } from 'next';
import { getRoles, getSummaries } from '@/lib/catalog';
import { RolesGrid } from '@/components/app/roles-grid';

export const metadata: Metadata = {
  title: 'Library',
  description: 'Role-specific system prompts with setup guides, ready to fill in and ship.',
};

export default async function RolesPage() {
  const [roles, personas] = await Promise.all([getRoles(), getSummaries()]);

  return (
    <div className="grid-glow relative mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <header className="relative mb-8">
        <h1 className="text-[26px] font-semibold leading-tight text-p-ink">Library</h1>
        <p className="mt-1.5 text-[14px] text-p-ink-2">Role-specific system prompts with setup guides, ready to fill in and ship.</p>
      </header>
      <div className="relative">
        <React.Suspense fallback={null}>
          <RolesGrid roles={roles} personas={personas} />
        </React.Suspense>
      </div>
    </div>
  );
}
