import { notFound } from 'next/navigation';
import { getPersona } from '@/lib/catalog';
import { CreateForkClient } from './create-fork-client';

export const dynamic = 'force-dynamic';

/**
 * `/editor/new?role=<roleSlug>&persona=<slug>` (PERSONA.md §6): loads the
 * source persona server-side, then a client child creates the fork in
 * localStorage and replaces to `/editor/<id>`.
 */
export default async function NewForkPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; persona?: string }>;
}) {
  const { role, persona: personaSlug } = await searchParams;
  if (!role || !personaSlug) notFound();

  const persona = await getPersona(role, personaSlug);
  if (!persona) notFound();

  return <CreateForkClient persona={persona} />;
}
