'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Persona } from '@/lib/catalog';
import { useForks, newForkId } from '@/lib/store';

/** Creates a fork from the source persona, then replaces to its editor route. */
export function CreateForkClient({ persona }: { persona: Persona }) {
  const router = useRouter();
  const { upsert } = useForks();
  const created = React.useRef(false);

  React.useEffect(() => {
    if (created.current) return;
    created.current = true;
    const id = newForkId();
    const now = new Date().toISOString();
    upsert({
      id,
      roleSlug: persona.roleSlug,
      personaSlug: persona.slug,
      sourceVersion: persona.version,
      title: persona.name,
      bodyMd: persona.bodyMd,
      values: {},
      createdAt: now,
      updatedAt: now,
    });
    router.replace(`/editor/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-p-ink-2">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-p-line border-t-blue" />
        Creating your fork…
      </div>
    </div>
  );
}
