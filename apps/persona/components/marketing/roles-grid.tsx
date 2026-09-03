'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import rolesData from '@/content/roles.json';
import { iconFor } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';

type Role = { slug: string; name: string; department: string; color: string; icon: string; summary: string };
const roles = rolesData as Role[];

const SKELETON_MS = 1200;

/** Eleven role cards; shimmer skeletons for the first ~1.2s, then staggered fade-up. */
export function RolesGrid() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), SKELETON_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map((role, i) => {
        if (!loaded) {
          return (
            <div key={role.slug} className="rounded-card border border-p-line bg-p-surface p-5">
              <Skeleton className="h-9 w-9 rounded-md shimmer bg-transparent" />
              <Skeleton className="mt-4 h-4 w-2/3 shimmer bg-transparent" />
              <Skeleton className="mt-2 h-3 w-1/3 shimmer bg-transparent" />
              <Skeleton className="mt-3 h-3 w-full shimmer bg-transparent" />
              <Skeleton className="mt-1.5 h-3 w-4/5 shimmer bg-transparent" />
            </div>
          );
        }

        const Icon = iconFor(role.icon);
        return (
          <Link
            key={role.slug}
            href={`/roles/${role.slug}`}
            className="group animate-fade-up rounded-card border border-p-line bg-p-surface p-5 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-p-line-2 hover:shadow-card-sm focus-visible:-translate-y-0.5"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-md"
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
    </div>
  );
}
