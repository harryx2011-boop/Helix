'use client';

import { useState } from 'react';
import { Boxes, Check, Trash2 } from 'lucide-react';
import { PillButton } from '@/components/converter/pill-button';
import { clearProviderKey, getProviderKey, setProviderKey } from '@/lib/converter/ai/keys';
import { AI_PROVIDER_LABEL, type AiProvider } from '@/lib/converter/ai/models';
import { AI_PROVIDER_MARK } from '@/lib/converter/ai/provider-marks';

export function AiKeyRow({ provider }: { provider: AiProvider }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(() => !!getProviderKey(provider));
  const [markFailed, setMarkFailed] = useState(false);

  return (
    <li className="flex min-h-[44px] flex-col gap-2 rounded-cv-card border border-p-line bg-p-surface px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex h-5 w-[52px] shrink-0 items-center justify-start">
        {markFailed ? (
          <Boxes aria-hidden className="h-5 w-5 text-p-ink-3" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={AI_PROVIDER_MARK[provider]}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            onError={() => setMarkFailed(true)}
            className="h-5 w-5 shrink-0 object-contain"
          />
        )}
      </span>
      <span className="w-24 shrink-0 text-body font-medium text-p-ink">{AI_PROVIDER_LABEL[provider]}</span>
      <input
        type="password"
        value={value}
        placeholder={saved ? 'Key saved in this browser' : 'Paste your API key'}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`${AI_PROVIDER_LABEL[provider]} API key`}
        className="h-11 min-w-0 flex-1 rounded-pill border border-p-line bg-p-bg px-4 font-mono text-sm text-p-ink placeholder:text-p-ink-3"
      />
      <div className="flex shrink-0 gap-2">
        <PillButton
          type="button"
          size="md"
          variant="secondary"
          disabled={!value.trim()}
          onClick={() => {
            setProviderKey(provider, value.trim());
            setSaved(true);
            setValue('');
          }}
        >
          <Check aria-hidden className="h-4 w-4" />
          Save
        </PillButton>
        {saved && (
          <PillButton
            type="button"
            size="md"
            variant="ghost"
            onClick={() => {
              clearProviderKey(provider);
              setSaved(false);
            }}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Clear
          </PillButton>
        )}
      </div>
    </li>
  );
}
