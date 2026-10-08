'use client';

import * as React from 'react';
import { Loader2, Mic, MicOff } from '@/components/icons/lucide';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { desktopVoice } from '@/lib/desktop';
import { useDictation } from '@/lib/voice-core/react';
import { cn } from '@/lib/utils';

export function joinDictation(current: string, heard: string): string {
  const text = heard.trim();
  if (!text) return current;
  if (!current || /\s$/.test(current)) return current + text;
  return `${current} ${text}`;
}

const LABELS = {
  idle: 'Dictate',
  starting: 'Getting ready',
  listening: 'Stop dictating',
  transcribing: 'Transcribing',
  error: 'Dictate again',
} as const;

export interface DictationCaption {
  text: string;
  error: boolean;
}

interface DictationButtonProps {
  onText: (text: string) => void;
  onCaption?: (caption: DictationCaption | null) => void;
}

function DictationControl({ onText, onCaption, connect }: DictationButtonProps & { connect: NonNullable<ReturnType<typeof desktopVoice>>['connect'] }) {
  const dictation = useDictation({ connect, onText });
  const { state, partial, error } = dictation;

  React.useEffect(() => {
    if (!onCaption) return;
    if (state === 'error' && error) onCaption({ text: error, error: true });
    else if (state === 'listening' && partial) onCaption({ text: partial, error: false });
    else onCaption(null);
  }, [state, partial, error, onCaption]);

  const busy = state === 'starting' || state === 'transcribing';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={LABELS[state]}
          aria-pressed={state === 'listening'}
          aria-busy={busy}
          disabled={state === 'transcribing'}
          onClick={dictation.toggle}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground disabled:pointer-events-none',
            state === 'listening' && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground motion-safe:animate-pulse',
            state === 'error' && 'text-destructive',
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : state === 'error' ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{LABELS[state]}</TooltipContent>
    </Tooltip>
  );
}

/** A mic for the desktop app only: the website has no local speech service, so nothing renders there. */
export function DictationButton(props: DictationButtonProps) {
  const [voice, setVoice] = React.useState<ReturnType<typeof desktopVoice>>(null);
  React.useEffect(() => setVoice(desktopVoice()), []);
  if (!voice) return null;
  return <DictationControl {...props} connect={voice.connect} />;
}
