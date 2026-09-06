'use client';

import * as React from 'react';
import { FileText, Image as ImageIcon, Music, Video } from 'lucide-react';
import type { FileKind } from '@/lib/converter/jobs/types';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/**
 * The dropzone is one target for everything, but the *formats* it accepts
 * differ per kind, and a wall of every extension at once tells nobody what
 * they can drop. The tabs name the four things this converts and let the
 * accepted list underneath be short enough to read.
 *
 * They filter what the picker offers; they never gate the drop. A file that
 * does not match the active tab still lands — the tab follows the file rather
 * than rejecting it, because a user who dropped an MP3 on the Video tab meant
 * to convert the MP3.
 */
export type TabKind = 'video' | 'audio' | 'image' | 'document';

/**
 * GIF is a FileKind of its own in the engine (it has its own two-pass palette
 * path) but it is not a fifth tab: to anyone picking a file it is an image
 * format, and the refs show four tabs. It rides under Image here and the
 * engine still routes it to the GIF pipeline on its own.
 */
export function tabForKind(kind: FileKind): TabKind {
  return kind === 'gif' ? 'image' : kind;
}

export const TAB_ORDER: TabKind[] = ['video', 'audio', 'image', 'document'];

const TABS: Record<TabKind, { label: string; icon: typeof Video; formats: string[] }> = {
  video: {
    label: 'Video',
    icon: Video,
    formats: ['MP4', 'MOV', 'MKV', 'AVI', 'WEBM'],
  },
  audio: {
    label: 'Audio',
    icon: Music,
    formats: ['MP3', 'WAV', 'FLAC', 'AAC', 'OGG', 'M4A'],
  },
  image: {
    label: 'Image',
    icon: ImageIcon,
    formats: ['PNG', 'JPG', 'WEBP', 'AVIF', 'TIFF', 'HEIC', 'GIF'],
  },
  document: {
    label: 'Document',
    icon: FileText,
    formats: ['PDF', 'CSV', 'XLSX', 'JSON', 'XML', 'TXT', 'HTML', 'MD'],
  },
};

export function formatsFor(kind: TabKind): string[] {
  return TABS[kind].formats;
}

type Props = {
  value: TabKind;
  onChange: (kind: TabKind) => void;
  className?: string;
};

export function KindTabs({ value, onChange, className }: Props) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const index = TAB_ORDER.indexOf(value);
    const next =
      e.key === 'Home'
        ? TAB_ORDER[0]
        : e.key === 'End'
          ? TAB_ORDER[TAB_ORDER.length - 1]
          : TAB_ORDER[(index + (e.key === 'ArrowRight' ? 1 : -1) + TAB_ORDER.length) % TAB_ORDER.length];
    if (!next) return;
    onChange(next);
    (e.currentTarget.querySelector(`[data-id="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="What kind of file are you converting?"
      onKeyDown={onKeyDown}
      className={cx('inline-flex max-w-full items-center rounded-pill border border-p-line bg-p-surface p-1', className)}
    >
      {TAB_ORDER.map((kind) => {
        const tab = TABS[kind];
        const Icon = tab.icon;
        const active = kind === value;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            data-id={kind}
            data-active={active}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(kind)}
            className={cx(
              'relative flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-1.5 text-[13px] font-medium',
              'transition-colors duration-150 ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
              active ? 'bg-blue text-[var(--p-on-blue)]' : 'text-p-ink-2 hover:text-p-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
