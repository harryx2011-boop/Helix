'use client';

import * as React from 'react';
import { WizardDialog, type WizardTarget } from './wizard-dialog';
import type { Persona, Role } from '@/lib/catalog';

/**
 * The primary "Fill in the blanks" entry point for a role page (PERSONA.md
 * §8.3): opens the templating wizard for the given persona. Type-only imports
 * from the server-only catalog keep this safe as a client component. `role`
 * is part of the contract other agents code against; not read here yet.
 */
export function WizardLauncher({ persona }: { persona: Persona; role: Role }) {
  const [open, setOpen] = React.useState(false);

  const target: WizardTarget = {
    roleSlug: persona.roleSlug,
    personaSlug: persona.slug,
    sourceVersion: persona.version,
    title: persona.name,
    bodyMd: persona.bodyMd,
    placeholders: persona.placeholders,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-pill bg-p-ink px-5 text-sm font-medium text-p-bg shadow-card-sm transition-colors duration-150 ease-out hover:bg-p-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-ring focus-visible:ring-offset-2"
      >
        Fill in the blanks
      </button>
      <WizardDialog target={open ? target : null} open={open} onOpenChange={setOpen} />
    </>
  );
}
