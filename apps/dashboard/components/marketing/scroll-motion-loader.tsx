'use client';

import dynamic from 'next/dynamic';

const ScrollMotion = dynamic(() => import('./scroll-motion').then((m) => m.ScrollMotion), { ssr: false });

export function ScrollMotionLoader() {
  return <ScrollMotion />;
}
