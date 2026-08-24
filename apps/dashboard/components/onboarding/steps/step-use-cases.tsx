'use client';

import { Bot, Workflow, Database, Eye, Users, Wrench } from 'lucide-react';
import { SelectCard } from '../select-card';

export const USE_CASES = [
  { id: 'agent-tools', label: 'Agent tools', icon: Bot, description: 'Giving an AI agent web access as a tool call.' },
  { id: 'research-pipeline', label: 'Research pipeline', icon: Workflow, description: 'Automated gathering and synthesis of sources.' },
  { id: 'rag-search-index', label: 'RAG / search index', icon: Database, description: 'Feeding a retrieval index with fresh content.' },
  { id: 'monitoring', label: 'Monitoring', icon: Eye, description: 'Watching pages for changes over time.' },
  { id: 'lead-crm-enrichment', label: 'Lead/CRM enrichment', icon: Users, description: 'Filling in company or contact data from the web.' },
  { id: 'internal-tooling', label: 'Internal tooling', icon: Wrench, description: 'Internal scripts or dashboards that need web data.' },
] as const;

export function StepUseCases({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {USE_CASES.map((useCase) => (
        <SelectCard
          key={useCase.id}
          icon={useCase.icon}
          label={useCase.label}
          description={useCase.description}
          selected={value.includes(useCase.id)}
          onSelect={() => toggle(useCase.id)}
        />
      ))}
    </div>
  );
}
