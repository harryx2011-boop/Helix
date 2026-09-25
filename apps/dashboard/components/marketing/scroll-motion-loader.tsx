'use client';

import dynamic from 'next/dynamic';

// gsap, gsap/ScrollTrigger and lenis are ~60-70 KB gzip and only ever run in
// the browser. ssr:false requires a Client Component boundary, which is this
// file; the layout that renders it stays a plain server component and the
// bundle loads after paint instead of blocking it.
const ScrollMotion = dynamic(() => import('./scroll-motion').then((m) => m.ScrollMotion), { ssr: false });

export function ScrollMotionLoader() {
  return <ScrollMotion />;
}
