'use client';

import { Code2, Rocket, FlaskConical, Database, MoreHorizontal } from 'lucide-react';
import { SelectCard } from '../select-card';

export const ROLES = [
  { id: 'engineer', label: 'Engineer', icon: Code2, description: 'Building software that needs live web data.' },
  { id: 'founder', label: 'Founder', icon: Rocket, description: 'Shipping a product that depends on the web.' },
  { id: 'researcher', label: 'Researcher', icon: FlaskConical, description: 'Gathering data for analysis or study.' },
  { id: 'data-ml', label: 'Data/ML', icon: Database, description: 'Feeding pipelines, models or agents.' },
  { id: 'other', label: 'Other', icon: MoreHorizontal, description: 'Something else entirely.' },
] as const;

export function StepRole({ value, onChange }: { value: string | null; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ROLES.map((role) => (
        <SelectCard
          key={role.id}
          icon={role.icon}
          label={role.label}
          description={role.description}
          selected={value === role.id}
          onSelect={() => onChange(role.id)}
        />
      ))}
    </div>
  );
}
