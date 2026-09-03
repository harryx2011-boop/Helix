import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { scanPlaceholders, type PlaceholderMeta } from './placeholders';

/**
 * The catalog, read from `content/` at build time. Files are the source of
 * truth; the Supabase seed (Phase 4) pushes the same shapes into
 * persona_roles / personas / persona_versions / persona_setup_guides.
 *
 * content/roles.json                 — the eleven roles
 * content/personas/<role>/<slug>.md  — one persona: frontmatter + body with {{PLACEHOLDERS}}
 * content/guides/<file>.md           — a setup-guide tab, referenced from a persona's frontmatter
 */

export type Tone = 'Warm' | 'Technical' | 'Formal' | 'Casual' | 'Consultative';
export type Platform = 'chat' | 'email' | 'code' | 'voice' | 'sql' | 'python' | 'docs' | 'llm';

export interface Role {
  slug: string;
  name: string;
  department: string;
  color: string;
  icon: string;
  summary: string;
  sortOrder: number;
}

export interface VersionEntry {
  version: number;
  date: string;
  note: string;
}

export interface Guide {
  tab: string;
  label: string;
  icon: string;
  platform: Platform;
  configKeys: Record<string, string>;
  bodyMd: string;
}

export interface Persona {
  roleSlug: string;
  slug: string;
  name: string;
  tagline: string;
  tone: Tone;
  platforms: Platform[];
  isDefault: boolean;
  version: number;
  history: VersionEntry[];
  placeholders: PlaceholderMeta[];
  guides: Guide[];
  bodyMd: string;
}

/** What the browser needs for search, filters and the grid: no bodies. */
export interface PersonaSummary {
  roleSlug: string;
  slug: string;
  name: string;
  tagline: string;
  tone: Tone;
  platforms: Platform[];
  isDefault: boolean;
  version: number;
  placeholderCount: number;
}

const CONTENT_DIR = join(process.cwd(), 'content');

let rolesCache: Role[] | undefined;
let personasCache: Persona[] | undefined;

export async function getRoles(): Promise<Role[]> {
  if (rolesCache) return rolesCache;
  const raw = JSON.parse(await readFile(join(CONTENT_DIR, 'roles.json'), 'utf8')) as Array<Omit<Role, 'sortOrder'> & { sortOrder?: number }>;
  rolesCache = raw.map((r, i) => ({ ...r, sortOrder: r.sortOrder ?? (i + 1) * 10 })).sort((a, b) => a.sortOrder - b.sortOrder);
  return rolesCache;
}

export async function getRole(slug: string): Promise<Role | undefined> {
  return (await getRoles()).find((r) => r.slug === slug);
}

interface Frontmatter {
  role: string;
  slug: string;
  name: string;
  tagline: string;
  tone: Tone;
  platforms: Platform[];
  default?: boolean;
  version: number;
  history?: VersionEntry[];
  placeholders?: Record<string, { label: string; hint?: string; default?: string }>;
  guides?: Array<{ tab: string; label: string; icon: string; platform: Platform; file: string }>;
}

/** YAML turns `date: 2026-09-02` into a Date; the UI wants the ISO day. */
function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '');
}

async function loadGuide(file: string): Promise<Omit<Guide, 'tab' | 'label' | 'icon' | 'platform'>> {
  const raw = await readFile(join(CONTENT_DIR, 'guides', file), 'utf8');
  const { data, content } = matter(raw);
  return { configKeys: (data.config_keys as Record<string, string> | undefined) ?? {}, bodyMd: content.trim() };
}

export async function getPersonas(): Promise<Persona[]> {
  if (personasCache) return personasCache;
  const roles = await getRoles();
  const out: Persona[] = [];
  for (const role of roles) {
    const dir = join(CONTENT_DIR, 'personas', role.slug);
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
    } catch {
      continue;
    }
    for (const file of files) {
      const raw = await readFile(join(dir, file), 'utf8');
      const { data, content } = matter(raw);
      const fm = data as Frontmatter;
      const bodyMd = content.trim();
      const guides: Guide[] = [];
      for (const g of fm.guides ?? []) {
        const loaded = await loadGuide(g.file);
        guides.push({ tab: g.tab, label: g.label, icon: g.icon, platform: g.platform, ...loaded });
      }
      out.push({
        roleSlug: role.slug,
        slug: fm.slug ?? file.replace(/\.md$/, ''),
        name: fm.name,
        tagline: fm.tagline,
        tone: fm.tone,
        platforms: fm.platforms ?? [],
        isDefault: Boolean(fm.default),
        version: fm.version ?? 1,
        history: (fm.history ?? []).map((h) => ({ ...h, date: dateString(h.date) })),
        placeholders: scanPlaceholders(bodyMd, fm.placeholders ?? {}),
        guides,
        bodyMd,
      });
    }
  }
  personasCache = out;
  return out;
}

export async function getPersonasForRole(roleSlug: string): Promise<Persona[]> {
  const all = await getPersonas();
  return all.filter((p) => p.roleSlug === roleSlug).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export async function getPersona(roleSlug: string, slug: string): Promise<Persona | undefined> {
  return (await getPersonas()).find((p) => p.roleSlug === roleSlug && p.slug === slug);
}

export async function getSummaries(): Promise<PersonaSummary[]> {
  return (await getPersonas()).map((p) => ({
    roleSlug: p.roleSlug,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    tone: p.tone,
    platforms: p.platforms,
    isDefault: p.isDefault,
    version: p.version,
    placeholderCount: p.placeholders.length,
  }));
}
