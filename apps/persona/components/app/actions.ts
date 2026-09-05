'use client';

import { toast } from 'sonner';
import { newForkId, type Fork } from '@/lib/store';
import type { Role } from '@/lib/catalog';
import type { PersonaClient } from './types';

export function copyPrompt(body: string) {
  navigator.clipboard
    .writeText(body)
    .then(() => toast.success('Prompt copied'))
    .catch(() => toast.error('Could not copy to clipboard'));
}

export function downloadMarkdown(persona: Pick<PersonaClient, 'name' | 'slug' | 'bodyMd'>) {
  const blob = new Blob([persona.bodyMd], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${persona.slug}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success('Downloaded');
}

export function forkPersona(role: Role, persona: PersonaClient): Fork {
  const now = new Date().toISOString();
  return {
    id: newForkId(),
    roleSlug: role.slug,
    personaSlug: persona.slug,
    sourceVersion: persona.version,
    title: `${persona.name} (copy)`,
    bodyMd: persona.bodyMd,
    values: {},
    createdAt: now,
    updatedAt: now,
  };
}
