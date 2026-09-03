'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PersonaSummary } from '@/lib/catalog';

export function PersonaSelect({
  roleSlug,
  personas,
  activeSlug,
}: {
  roleSlug: string;
  personas: PersonaSummary[];
  activeSlug: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (personas.length <= 1) return null;

  return (
    <Select
      value={activeSlug}
      onValueChange={(slug) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('persona', slug);
        router.push(`/roles/${roleSlug}?${params.toString()}`, { scroll: false });
      }}
    >
      <SelectTrigger className="w-fit min-w-[220px] rounded-card border-p-line bg-p-surface text-[13.5px] focus:ring-blue-ring">
        <SelectValue placeholder="Choose a persona" />
      </SelectTrigger>
      <SelectContent className="rounded-card">
        {personas.map((p) => (
          <SelectItem key={p.slug} value={p.slug} className="text-[13.5px]">
            {p.name}
            {p.isDefault ? <span className="ml-1.5 text-p-ink-3">(default)</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
