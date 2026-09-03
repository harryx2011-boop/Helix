'use client';

import { useEffect, useId, useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import { PillButton } from '@/components/ui/pill-button';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Props = { stderr: string };

export function ErrorLog({ stderr }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stderr);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <PillButton
          variant="ghost"
          size="md"
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight
            aria-hidden="true"
            className={cx('h-4 w-4 transition-transform duration-150', open && 'rotate-90')}
          />
          {open ? 'Hide log' : 'Show log'}
        </PillButton>
        {open && (
          <PillButton variant="ghost" size="md" type="button" onClick={copy} aria-live="polite">
            {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </PillButton>
        )}
      </div>
      <div
        id={id}
        className={cx('grid transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-hidden">
          <pre
            tabIndex={open ? 0 : -1}
            aria-label="ffmpeg output"
            className="mt-2 max-h-64 select-text overflow-auto whitespace-pre-wrap break-words rounded-card border border-p-line bg-p-code p-3 font-mono text-xs leading-relaxed text-p-ink-2"
          >
            {stderr}
          </pre>
        </div>
      </div>
    </div>
  );
}
