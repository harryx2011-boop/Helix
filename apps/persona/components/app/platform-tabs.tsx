'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { iconFor } from '@/components/icons';
import type { Guide } from '@/lib/catalog';

function ConfigPanel({ configKeys }: { configKeys: Record<string, string> }) {
  const entries = Object.entries(configKeys);
  if (entries.length === 0) return null;
  return (
    <pre className="overflow-x-auto rounded-card bg-[#111114] p-3.5 font-mono text-[12.5px] leading-relaxed text-[#e6e6eb]">
      {entries.map(([key, value]) => (
        <div key={key}>
          <span className="text-[#6b9bf2]">{key}</span>
          <span className="text-[#8c8c96]"> = </span>
          <span className="text-[#c9e0a5]">&quot;{value}&quot;</span>
        </div>
      ))}
    </pre>
  );
}

export function PlatformTabs({ guides }: { guides: Guide[] }) {
  if (guides.length === 0) return null;
  const defaultTab = guides[0]!.tab;

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="w-full justify-start overflow-x-auto rounded-card bg-p-code p-1">
        {guides.map((guide) => {
          const Icon = iconFor(guide.icon);
          return (
            <TabsTrigger
              key={guide.tab}
              value={guide.tab}
              className="gap-1.5 rounded-[8px] text-[12.5px] data-[state=active]:bg-p-surface data-[state=active]:shadow-card-sm"
            >
              <Icon className="h-3.5 w-3.5" />
              {guide.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {guides.map((guide) => (
        <TabsContent key={guide.tab} value={guide.tab} className="mt-3 flex flex-col gap-3">
          <ConfigPanel configKeys={guide.configKeys} />
          <div className="prose-persona text-[13.5px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{guide.bodyMd}</ReactMarkdown>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
