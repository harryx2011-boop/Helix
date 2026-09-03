import type { Persona, PersonaSummary, Platform, Role, Tone } from '@/lib/catalog';

/** `Persona` minus server-only fields, safe to pass into client components. */
export type PersonaClient = Persona;

export interface CatalogEntry {
  role: Role;
  personas: PersonaSummary[];
}

export const TONES: Tone[] = ['Warm', 'Technical', 'Formal', 'Casual', 'Consultative'];
export const PLATFORMS: Platform[] = ['chat', 'email', 'code', 'voice', 'sql', 'python', 'docs', 'llm'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  chat: 'Chat',
  email: 'Email',
  code: 'Code',
  voice: 'Voice',
  sql: 'SQL',
  python: 'Python',
  docs: 'Docs',
  llm: 'LLM',
};
