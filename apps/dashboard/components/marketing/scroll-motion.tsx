'use client';

import * as React from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scroll (Lenis, driven by the GSAP ticker) + a `[data-reveal]` /
 * `[data-reveal-group] > [data-reveal-item]` convention for scroll-triggered
 * section reveals across the marketing site. One instance per page, mounted
 * in `(marketing)/layout.tsx`. Keyboard scrolling is untouched — Lenis only
 * smooths wheel/touch input, it never intercepts PageDown/Space/arrow keys.
 */
export function ScrollMotion() {
  React.useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      document.documentElement.classList.remove('has-motion');
      gsap.set('[data-reveal], [data-reveal-item]', { autoAlpha: 1, clearProps: 'transform' });
      return;
    }

    document.documentElement.classList.add('has-motion');

    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
        const items = group.querySelectorAll('[data-reveal-item]');
        if (!items.length) return;
        gsap.set(group, { autoAlpha: 1 });
        gsap.fromTo(
          items,
          { y: 20, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.5,
            ease: 'power3.out',
            stagger: 0.06,
            scrollTrigger: { trigger: group, start: 'top 85%', once: true },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>('[data-reveal]:not([data-reveal-item])').forEach((el) => {
        gsap.set(el, { autoAlpha: 1 });
        gsap.fromTo(
          el,
          { y: 20, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.5,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          },
        );
      });
    });

    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);

    return () => {
      window.removeEventListener('load', onLoad);
      gsap.ticker.remove(tick);
      lenis.destroy();
      ctx.revert();
    };
  }, []);

  return null;
}
