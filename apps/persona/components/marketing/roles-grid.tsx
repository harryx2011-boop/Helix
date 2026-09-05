'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import rolesData from '@/content/roles.json';
import { iconFor } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';

type Role = { slug: string; name: string; department: string; color: string; icon: string; summary: string };
const roles = rolesData as Role[];

const CURATED_SLUGS = [
  'support-chat',
  'sales',
  'product',
  'developer-relations',
  'security',
  'hr',
  'legal',
  'code-review',
];

const curated = CURATED_SLUGS.map((slug) => roles.find((r) => r.slug === slug)).filter(
  (r): r is Role => Boolean(r),
);
const curatedSlugs = new Set(curated.map((r) => r.slug));
const remaining = roles.filter((r) => !curatedSlugs.has(r.slug));

const SKELETON_MS = 600;

/** Eight curated role cards plus a "browse the library" card chip-listing the rest. */
export function RolesGrid() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), SKELETON_MS);
    return () => clearTimeout(t);
  }, []);

  if (!loaded) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-card border border-p-line bg-p-surface p-5">
            <Skeleton className="h-9 w-9 rounded-md shimmer bg-transparent" />
            <Skeleton className="mt-4 h-4 w-2/3 shimmer bg-transparent" />
            <Skeleton className="mt-2 h-3 w-1/3 shimmer bg-transparent" />
            <Skeleton className="mt-3 h-3 w-full shimmer bg-transparent" />
            <Skeleton className="mt-1.5 h-3 w-4/5 shimmer bg-transparent" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {curated.map((role, i) => {
        const Icon = iconFor(role.icon);
        return (
          <Link
            key={role.slug}
            href={`/roles/${role.slug}`}
            className="group animate-fade-up rounded-card border border-p-line bg-p-surface p-5 transition-[box-shadow,border-color] duration-200 ease-out hover:border-p-line-2 hover:shadow-card"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-200 ease-out group-hover:brightness-110"
              style={{ backgroundColor: `${role.color}1F`, color: role.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-[15px] font-semibold text-p-ink">{role.name}</h3>
            <p className="mt-0.5 text-[12px] font-medium text-p-ink-3">{role.department}</p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-p-ink-2">{role.summary}</p>
          </Link>
        );
      })}

      <Link
        href="/roles"
        className="group animate-fade-up flex flex-col rounded-card border border-p-line bg-p-surface p-5 transition-[box-shadow,border-color] duration-200 ease-out hover:border-p-line-2 hover:shadow-card"
        style={{ animationDelay: `${curated.length * 50}ms` }}
      >
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-p-ink">
          Browse the library
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
        </h3>
        <p className="mt-0.5 text-[12px] font-medium text-p-ink-3">And every other role</p>
        <div className="mt-3 flex max-h-[72px] flex-wrap gap-1.5 overflow-hidden">
          {remaining.map((role) => (
            <span
              key={role.slug}
              className="rounded-pill px-2 py-1 text-[11px] font-medium"
              style={{ backgroundColor: `${role.color}1F`, color: role.color }}
            >
              {role.name}
            </span>
          ))}
        </div>
      </Link>
    </div>
  );
}
