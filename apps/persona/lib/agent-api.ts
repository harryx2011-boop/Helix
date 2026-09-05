import 'server-only';
import { getPersonas, getRoles, type Persona, type Role } from './catalog';

/**
 * The agent surface (PERSONA-REVAMP.md Track 3): the catalog as JSON, a
 * persona's system prompt as markdown, and a generated SKILL.md that teaches
 * an agent to list, pick and fill. No auth, no database; everything here is
 * derived from `content/` so it can never list a persona that does not exist.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4200').replace(/\/$/, '');

export interface PlaceholderJson {
  key: string;
  label: string;
  hint?: string;
  default?: string;
}

export interface PersonaIndexEntry {
  role: string;
  slug: string;
  name: string;
  tagline: string;
  tone: string;
  platforms: string[];
  default: boolean;
  version: number;
  placeholders: PlaceholderJson[];
  url: string;
  markdownUrl: string;
}

export interface PersonaIndex {
  site: string;
  skill: string;
  roles: Array<Pick<Role, 'slug' | 'name' | 'department' | 'summary'>>;
  personas: PersonaIndexEntry[];
}

function placeholderJson(p: Persona['placeholders'][number]): PlaceholderJson {
  return { key: p.key, label: p.label, ...(p.hint !== undefined ? { hint: p.hint } : {}), ...(p.default !== undefined ? { default: p.default } : {}) };
}

export function personaUrl(base: string, p: Pick<Persona, 'roleSlug' | 'slug'>): string {
  return `${base}/api/personas/${p.roleSlug}/${p.slug}`;
}

export async function buildIndex(base: string): Promise<PersonaIndex> {
  const [roles, personas] = await Promise.all([getRoles(), getPersonas()]);
  const withContent = new Set(personas.map((p) => p.roleSlug));
  return {
    site: base,
    skill: `${base}/skill.md`,
    roles: roles.filter((r) => withContent.has(r.slug)).map((r) => ({ slug: r.slug, name: r.name, department: r.department, summary: r.summary })),
    personas: personas.map((p) => ({
      role: p.roleSlug,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      tone: p.tone,
      platforms: p.platforms,
      default: p.isDefault,
      version: p.version,
      placeholders: p.placeholders.map(placeholderJson),
      url: personaUrl(base, p),
      markdownUrl: `${personaUrl(base, p)}?format=md`,
    })),
  };
}

export interface PersonaDetail {
  role: Pick<Role, 'slug' | 'name' | 'department' | 'summary'>;
  slug: string;
  name: string;
  tagline: string;
  tone: string;
  platforms: string[];
  default: boolean;
  version: number;
  history: Persona['history'];
  placeholders: PlaceholderJson[];
  guides: Array<{ tab: string; label: string; platform: string; configKeys: Record<string, string>; bodyMd: string }>;
  bodyMd: string;
  markdownUrl: string;
  pageUrl: string;
}

export function personaDetail(base: string, role: Role, p: Persona): PersonaDetail {
  return {
    role: { slug: role.slug, name: role.name, department: role.department, summary: role.summary },
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    tone: p.tone,
    platforms: p.platforms,
    default: p.isDefault,
    version: p.version,
    history: p.history,
    placeholders: p.placeholders.map(placeholderJson),
    guides: p.guides.map((g) => ({ tab: g.tab, label: g.label, platform: g.platform, configKeys: g.configKeys, bodyMd: g.bodyMd })),
    bodyMd: p.bodyMd,
    markdownUrl: `${personaUrl(base, p)}?format=md`,
    pageUrl: `${base}/roles/${p.roleSlug}?persona=${p.slug}`,
  };
}

/** SKILL.md, in the shape Helix's `lib/skill.ts` uses: a preamble, then a directory the agent can act on without another round trip. */
export async function generateSkillMarkdown(base: string): Promise<string> {
  const [roles, personas] = await Promise.all([getRoles(), getPersonas()]);
  const byRole = new Map<string, Persona[]>();
  for (const p of personas) byRole.set(p.roleSlug, [...(byRole.get(p.roleSlug) ?? []), p]);

  const directory = roles
    .filter((r) => byRole.has(r.slug))
    .map((r) => {
      const list = (byRole.get(r.slug) ?? []).slice().sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
      const rows = list.map((p) => `- \`${p.roleSlug}/${p.slug}\`${p.isDefault ? ' (default)' : ''} · ${p.name} · ${p.tone} · ${p.platforms.join('/')} · ${p.tagline} · keys: ${p.placeholders.map((ph) => ph.key).join(', ') || 'none'}`);
      return `### ${r.name} (${r.department}) · \`${r.slug}\`\n\n${r.summary}\n\n${rows.join('\n')}`;
    })
    .join('\n\n');

  return `---
name: persona
description: Pick a role-specific system prompt from the Persona library (support, sales, security, legal, engineering, and the rest of the org chart), fill its placeholders, and put it first in a system prompt. Reach for this whenever a task is role-shaped: something a person with a job title would do.
---

# Persona

Base URL: \`${base}\`

No key, no account. Everything below is a public GET.

## Where this file lives

Save it as \`SKILL.md\` under \`.claude/skills/persona/\` (Claude Code, project-local) or \`~/.claude/skills/persona/\` (global); \`.agents/skills/persona/\` or \`~/.agents/skills/persona/\` for Codex, Cursor and other Agent-Skills tools. Fetch a fresh copy from \`${base}/skill.md\` when the library moves; the directory at the bottom is generated from the catalog and is never edited by hand.

## The three calls

1. **List.** \`GET ${base}/api/personas\` returns \`{ site, skill, roles[], personas[] }\`. Each persona carries \`role\`, \`slug\`, \`name\`, \`tagline\`, \`tone\`, \`platforms\`, \`default\`, \`version\`, \`placeholders[]\` (\`key\`, \`label\`, optional \`hint\` and \`default\`), \`url\` and \`markdownUrl\`. The directory below is the same data, so the call is only needed when this file may be stale.
2. **Fetch.** \`GET ${base}/api/personas/{role}/{slug}\` returns the persona as JSON with \`bodyMd\` (the system prompt), \`placeholders\`, \`guides\` (one per platform, each with \`configKeys\` and setup steps) and \`history\`. Add \`?format=md\` or send \`Accept: text/markdown\` to get the system prompt alone as markdown. Unknown role or slug: 404 with \`{ "error": "not_found" }\`.
3. **Fill.** Replace every \`{{KEY}}\` in the body with the value for that key. Keys are listed on the persona; use the placeholder's \`default\` only when the task supplies nothing better. A key you cannot fill stays as \`{{KEY}}\`, and you say so in one line above the prompt: "Unfilled placeholders are unknown; ask or state the assumption."

## Using the result

Put the filled body **first** in the system prompt, then the task context (repo, files, the concrete ask, constraints, the report shape). The persona sets voice, workflows and guardrails; your own rules sit on top of it and win on conflict. Prefer the role's default persona unless a variant is clearly closer (a security-first reviewer for a security review). Do not force a persona onto mechanical work.

\`\`\`bash
curl -s "${base}/api/personas/support-chat/default?format=md"
\`\`\`

## Directory

${directory}
`;
}
