'use client';

import Link from 'next/link';
import { WizardLauncher } from '@/components/wizard/launcher';
import type { Role, Persona } from '@/lib/catalog';
import { CardMenu } from './card-menu';

/** One hero action (the wizard), one secondary (the editor); copy, download, fork and favourite live in the menu. */
export function RoleActions({ role, persona }: { role: Role; persona: Persona }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <WizardLauncher persona={persona} role={role} />
      <Link
        href={`/editor/new?role=${role.slug}&persona=${persona.slug}`}
        className="inline-flex h-10 items-center rounded-pill bg-p-wash px-5 text-sm font-medium text-p-ink transition-colors duration-150 ease-out hover:bg-p-wash-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-ring focus-visible:ring-offset-2"
      >
        Open in editor
      </Link>
      <CardMenu role={role} persona={persona} />
    </div>
  );
}
