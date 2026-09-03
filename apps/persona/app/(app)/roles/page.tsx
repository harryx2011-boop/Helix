import * as React from 'react';
import type { Metadata } from 'next';
import { getRoles, getSummaries } from '@/lib/catalog';
import { RolesGrid } from '@/components/app/roles-grid';

export const metadata: Metadata = {
  title: 'Browse the library',
  description: 'Eleven roles, each with system prompts ready to fill in and ship.',
};

export default async function RolesPage() {
  const [roles, personas] = await Promise.all([getRoles(), getSummaries()]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <header className="mb-8">
        <h1 className="text-[26px] font-semibold leading-tight text-p-ink">Browse the library</h1>
        <p className="mt-1.5 text-[14px] text-p-ink-2">Eleven roles, each with system prompts ready to fill in and ship.</p>
      </header>
      <React.Suspense fallback={null}>
        <RolesGrid roles={roles} personas={personas} />
      </React.Suspense>
    </div>
  );
}
