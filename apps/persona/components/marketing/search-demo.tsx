'use client';

import { useEffect, useRef, useState } from 'react';
import rolesData from '@/content/roles.json';
import { iconFor } from '@/components/icons';

type Role = { slug: string; name: string; department: string; color: string; icon: string; summary: string };
const roles = rolesData as Role[];

const QUERIES = ['support', 'sales', 'security', 'data'];
const TYPE_MS = [40, 90] as const;
const BACKSPACE_MS = 25;
const HOLD_MS = 1600;
const STAGGER_MS = 60;

type Phase = 'moveToInput' | 'focus' | 'typing' | 'holding' | 'backspacing' | 'pause';

function matches(query: string): Role[] {
  if (!query) return [];
  const q = query.toLowerCase();
  return roles.filter((r) => r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q)).slice(0, 4);
}

/**
 * Looping demo: a fake cursor glides to the search input, focuses it, types
 * a query, matching roles fade in staggered, holds, backspaces, repeats with
 * the next query. Pure state machine driven by timeouts; paused off-screen.
 */
export function SearchDemo() {
  const [phase, setPhase] = useState<Phase>('moveToInput');
  const [queryIndex, setQueryIndex] = useState(0);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [cursorAtInput, setCursorAtInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      const q = QUERIES[0]!;
      setText(q);
      setFocused(true);
      setCursorAtInput(true);
      return;
    }
    if (!visible) return;

    let timer: ReturnType<typeof setTimeout>;
    const query = QUERIES[queryIndex % QUERIES.length]!;

    if (phase === 'moveToInput') {
      timer = setTimeout(() => {
        setCursorAtInput(true);
        setPhase('focus');
      }, 500);
    } else if (phase === 'focus') {
      timer = setTimeout(() => {
        setFocused(true);
        setPhase('typing');
      }, 260);
    } else if (phase === 'typing') {
      if (text.length < query.length) {
        const [min, max] = TYPE_MS;
        const delay = min + Math.random() * (max - min);
        timer = setTimeout(() => setText(query.slice(0, text.length + 1)), delay);
      } else {
        timer = setTimeout(() => setPhase('holding'), 300 + roles.length * STAGGER_MS);
      }
    } else if (phase === 'holding') {
      timer = setTimeout(() => setPhase('backspacing'), HOLD_MS);
    } else if (phase === 'backspacing') {
      if (text.length > 0) {
        timer = setTimeout(() => setText(text.slice(0, -1)), BACKSPACE_MS);
      } else {
        setFocused(false);
        setCursorAtInput(false);
        timer = setTimeout(() => {
          setQueryIndex((i) => (i + 1) % QUERIES.length);
          setPhase('moveToInput');
        }, 500);
      }
    }

    return () => clearTimeout(timer);
  }, [phase, text, queryIndex, visible, reducedMotion]);

  const results = matches(text);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[440px] select-none rounded-panel border border-p-line bg-p-surface shadow-panel ring-1 ring-p-highlight"
    >
      <div className="flex items-center gap-1.5 border-b border-p-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
        <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
        <span className="h-2.5 w-2.5 rounded-full bg-p-line-2" />
        <span className="ml-3 truncate rounded-md bg-p-code px-2.5 py-1 font-mono text-[11px] text-p-ink-3">
          persona-helix.vercel.app
        </span>
      </div>

      <div className="relative p-4">
        <div
          className={`flex items-center gap-2 rounded-card border bg-p-bg px-3 py-2 transition-[box-shadow,border-color,transform] duration-200 ease-out ${
            focused ? 'border-blue shadow-[0_0_0_3px_var(--p-blue-ring)]' : 'border-p-line'
          }`}
          style={{ transform: focused ? 'scale(1.02)' : 'scale(1)' }}
        >
          <SearchIconGlyph />
          <span className="font-mono text-sm text-p-ink">
            {text}
            <span className="ml-px inline-block w-px animate-blink bg-p-ink align-middle" style={{ height: '1em' }} />
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-1.5 min-h-[168px]">
          {results.map((role, i) => {
            const Icon = iconFor(role.icon);
            return (
              <div
                key={role.slug}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 animate-fade-up"
                style={{ animationDelay: `${i * STAGGER_MS}ms` }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${role.color}1F`, color: role.color }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate text-[13px] font-medium text-p-ink">{role.name}</span>
                <span className="truncate text-[12px] text-p-ink-3">{role.department}</span>
              </div>
            );
          })}
        </div>

        {!reducedMotion && (
          <div
            className="pointer-events-none absolute transition-opacity duration-300 ease-out"
            style={{
              left: 0,
              top: 0,
              opacity: phase === 'backspacing' && text.length === 0 ? 0 : 1,
              transform: `translate(${cursorAtInput ? 116 : 260}px, ${cursorAtInput ? 68 : 20}px)`,
              transition: 'transform 500ms cubic-bezier(0.23,1,0.32,1), opacity 300ms ease-out',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 1.5 13.5 8 8 9.2 6 14.5 2 1.5Z" fill="var(--p-ink)" stroke="var(--p-surface)" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIconGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-p-ink-3">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
