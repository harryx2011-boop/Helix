'use client';

import Link from 'next/link';
import { iconFor, PLATFORM_ICONS } from '@/components/icons';
import type { Role, PersonaSummary } from '@/lib/catalog';
import { CardMenu } from './card-menu';
import type { PersonaClient } from './types';

export function RoleCard({
  role,
  personas,
  defaultPersona,
  index,
}: {
  role: Role;
  personas: PersonaSummary[];
  defaultPersona: PersonaClient;
  index: number;
}) {
  const Icon = iconFor(role.icon);
  const platforms = [...new Set(personas.flatMap((p) => p.platforms))];

  return (
    <Link
      href={`/roles/${role.slug}`}
      style={{ animationDelay: `${Math.min(index, 16) * 45}ms` }}
      className="animate-fade-up group relative flex flex-col gap-3 rounded-card border border-p-line bg-p-surface p-5 shadow-card-sm transition-colors hover:border-p-line-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-card"
          style={{ backgroundColor: `${role.color}1f`, color: role.color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <CardMenu role={role} persona={defaultPersona} className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
      </div>

      <div className="flex-1">
        <h3 className="text-[15px] font-semibold leading-tight text-p-ink">{role.name}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-p-ink-2">{role.summary}</p>
      </div>

      <div className="flex items-center justify-between border-t border-p-line pt-3 text-[12px] text-p-ink-3">
        <span>
          {personas.length} {personas.length === 1 ? 'persona' : 'personas'}
        </span>
        <div className="flex items-center gap-1.5">
          {platforms.slice(0, 4).map((platform) => {
            const PlatformIcon = PLATFORM_ICONS[platform];
            return PlatformIcon ? <PlatformIcon key={platform} className="h-3.5 w-3.5" /> : null;
          })}
        </div>
      </div>
    </Link>
  );
}
