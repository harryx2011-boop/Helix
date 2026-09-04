import * as React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPersonas, getPersonasForRole, getRole, getRoles } from '@/lib/catalog';
import { iconFor } from '@/components/icons';
import { PromptView } from '@/components/prompt-view';
import { PersonaSelect } from '@/components/app/persona-select';
import { PlatformTabs } from '@/components/app/platform-tabs';
import { RoleActions } from '@/components/app/role-actions';

export async function generateStaticParams() {
  const [roles, personas] = await Promise.all([getRoles(), getPersonas()]);
  const rolesWithContent = new Set(personas.map((p) => p.roleSlug));
  return roles.filter((role) => rolesWithContent.has(role.slug)).map((role) => ({ slug: role.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const role = await getRole(slug);
  if (!role) return {};
  return { title: role.name, description: role.summary };
}

export default async function RolePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ persona?: string }>;
}) {
  const { slug } = await params;
  const { persona: personaParam } = await searchParams;
  const role = await getRole(slug);
  if (!role) notFound();

  const personas = await getPersonasForRole(slug);
  if (personas.length === 0) notFound();

  const active = personas.find((p) => p.slug === personaParam) ?? personas.find((p) => p.isDefault) ?? personas[0]!;
  const Icon = iconFor(role.icon);
  const summaries = personas.map((p) => ({
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card"
            style={{ backgroundColor: `${role.color}1f`, color: role.color }}
          >
            <Icon className="h-5.5 w-5.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold leading-tight text-p-ink">{role.name}</h1>
              <span
                className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: `${role.color}1f`, color: role.color }}
              >
                {role.department}
              </span>
            </div>
            <p className="mt-1 text-[14px] text-p-ink-2">{role.summary}</p>
          </div>
        </div>

        <React.Suspense fallback={null}>
          <PersonaSelect roleSlug={role.slug} personas={summaries} activeSlug={active.slug} />
        </React.Suspense>
        <RoleActions role={role} persona={active} />
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 rounded-panel border border-p-line bg-p-surface p-6 shadow-card-sm">
          <PromptView body={active.bodyMd} />
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-panel border border-p-line bg-p-surface p-4 shadow-card-sm">
            <PlatformTabs guides={active.guides} />
          </div>
        </aside>
      </div>
    </div>
  );
}
