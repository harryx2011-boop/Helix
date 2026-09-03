'use client';

import * as React from 'react';
import type { Persona, PersonaSummary, Role } from '@/lib/catalog';
import { useCatalogFilters } from './use-catalog-filters';
import { RoleCard } from './role-card';

const REVEAL_DELAY_MS = 1200;

export function RolesGrid({
  roles,
  personas,
}: {
  roles: Role[];
  personas: PersonaSummary[];
}) {
  const { filters } = useCatalogFilters();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setReady(true), reduced ? 0 : REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const personasByRole = React.useMemo(() => {
    const map = new Map<string, PersonaSummary[]>();
    for (const p of personas) {
      const list = map.get(p.roleSlug) ?? [];
      list.push(p);
      map.set(p.roleSlug, list);
    }
    return map;
  }, [personas]);

  const filtered = React.useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return roles.filter((role) => {
      const rolePersonas = personasByRole.get(role.slug) ?? [];
      if (rolePersonas.length === 0) return false;
      if (filters.dept.length && !filters.dept.includes(role.department)) return false;
      if (filters.platform.length && !rolePersonas.some((p) => p.platforms.some((pl) => filters.platform.includes(pl)))) return false;
      if (filters.tone.length && !rolePersonas.some((p) => filters.tone.includes(p.tone))) return false;
      if (q && !`${role.name} ${role.summary} ${role.department}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roles, personasByRole, filters]);

  if (!ready) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex h-[172px] flex-col gap-3 rounded-card border border-p-line bg-p-surface p-5">
            <div className="shimmer h-10 w-10 rounded-card" />
            <div className="shimmer h-4 w-2/3 rounded-md" />
            <div className="shimmer h-3 w-full rounded-md" />
            <div className="shimmer h-3 w-4/5 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-card border border-dashed border-p-line text-center">
        <p className="text-[14px] font-medium text-p-ink">No roles match those filters</p>
        <p className="mt-1 text-[13px] text-p-ink-3">Try clearing a filter or searching a different term.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((role, index) => {
        const rolePersonas = personasByRole.get(role.slug) ?? [];
        const defaultSummary = rolePersonas.find((p) => p.isDefault) ?? rolePersonas[0];
        if (!defaultSummary) return null;
        const defaultPersona: Persona = {
          roleSlug: role.slug,
          slug: defaultSummary.slug,
          name: defaultSummary.name,
          tagline: defaultSummary.tagline,
          tone: defaultSummary.tone,
          platforms: defaultSummary.platforms,
          isDefault: defaultSummary.isDefault,
          version: defaultSummary.version,
          history: [],
          placeholders: [],
          guides: [],
          bodyMd: '',
        };
        return (
          <RoleCard key={role.slug} role={role} personas={rolePersonas} defaultPersona={defaultPersona} index={index} />
        );
      })}
    </div>
  );
}
