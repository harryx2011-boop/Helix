import * as React from 'react';
import { Playground } from '@/components/playground/playground';

/**
 * The tab is read client-side rather than from `searchParams`: self-host
 * prerenders this page into a static export, where awaiting searchParams is a
 * build error.
 *
 * `Playground` calls `useSearchParams`, which opts the route out of static
 * prerendering unless it sits under a Suspense boundary.
 */
export default function PlaygroundPage() {
  return (
    <React.Suspense fallback={<div className="flex h-full flex-col gap-6 overflow-y-auto p-6" />}>
      <Playground />
    </React.Suspense>
  );
}
