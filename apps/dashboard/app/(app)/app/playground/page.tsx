import * as React from 'react';
import { Playground } from '@/components/playground/playground';

export default function PlaygroundPage() {
  return (
    <React.Suspense fallback={<div className="flex h-full flex-col gap-6 overflow-y-auto p-6" />}>
      <Playground />
    </React.Suspense>
  );
}
