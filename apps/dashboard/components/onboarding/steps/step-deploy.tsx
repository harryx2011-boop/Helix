'use client';

import { Cloud, Server, Layers } from 'lucide-react';
import { SelectCard } from '../select-card';

export const DEPLOY_INTENTS = [
  { id: 'hosted', label: 'Hosted', icon: Cloud, description: 'Use the Helix-run API with your key.' },
  { id: 'self-host', label: 'Self-host', icon: Server, description: 'Run Helix yourself with docker compose.' },
  { id: 'both', label: 'Both', icon: Layers, description: 'Hosted to start, self-host later or in parallel.' },
] as const;

export function StepDeploy({ value, onChange }: { value: string | null; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {DEPLOY_INTENTS.map((intent) => (
        <SelectCard
          key={intent.id}
          icon={intent.icon}
          label={intent.label}
          description={intent.description}
          selected={value === intent.id}
          onSelect={() => onChange(intent.id)}
        />
      ))}
    </div>
  );
}
