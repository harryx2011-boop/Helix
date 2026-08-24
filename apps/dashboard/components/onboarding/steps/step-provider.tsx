'use client';

import { Sparkles, Brain, Gem, Waypoints, Server, HelpCircle } from 'lucide-react';
import { SelectCard } from '../select-card';

/** lucide icons stand in for provider identity — no brand logos (task spec). */
export const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', icon: Sparkles, description: 'Claude models.' },
  { id: 'openai', label: 'OpenAI', icon: Brain, description: 'GPT models.' },
  { id: 'google', label: 'Google', icon: Gem, description: 'Gemini models.' },
  { id: 'openrouter', label: 'OpenRouter', icon: Waypoints, description: 'Route to any model behind one key.' },
  { id: 'local', label: 'Local (Ollama/vLLM)', icon: Server, description: 'Self-hosted inference, no external key.' },
  { id: 'not-sure', label: 'Not sure yet', icon: HelpCircle, description: "We'll default to a sensible option." },
] as const;

export function StepProvider({ value, onChange }: { value: string | null; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PROVIDERS.map((provider) => (
        <SelectCard
          key={provider.id}
          icon={provider.icon}
          label={provider.label}
          description={provider.description}
          selected={value === provider.id}
          onSelect={() => onChange(provider.id)}
        />
      ))}
    </div>
  );
}
