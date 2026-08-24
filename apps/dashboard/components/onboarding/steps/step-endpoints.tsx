'use client';

import { PRODUCTS } from '@/lib/catalog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/** Checklist rows built from ENDPOINTS' product-facing entries (WEBSITE.md §6.2 step 5). Map lives inside Search's row. */
export function StepEndpoints({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="divide-y divide-m-border-faint rounded-card border border-m-border-loud bg-m-surface">
      {PRODUCTS.map((endpoint) => {
        const Icon = endpoint.icon;
        const checked = value.includes(endpoint.id);
        return (
          <label
            key={endpoint.id}
            className={cn(
              'flex min-h-[44px] cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 ease-out hover:bg-[#0B1220]/[0.031]',
            )}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => toggle(endpoint.id)}
              className="border-m-border-loud data-[state=checked]:border-violet data-[state=checked]:bg-violet"
            />
            <Icon className="h-4 w-4 shrink-0 text-m-ink/70" aria-hidden />
            <span className="flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-medium leading-tight text-m-ink">{endpoint.name}</span>
                {endpoint.status === 'coming' ? (
                  <span className="rounded-full border border-m-border-loud px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-m-ink/56">
                    Coming
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-m-ink/64">{endpoint.tagline}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
