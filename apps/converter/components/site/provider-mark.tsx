'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import type { Provider } from '@/lib/providers';

/**
 * A project's real mark, on fixed tile geometry so a row never shifts when one
 * image is slower than the rest. A wordmark is letterboxed rather than cropped
 * to a square. The fallback is a neutral glyph, never a letter standing in for
 * a brand.
 */
export function ProviderMark({
  provider,
  size = 20,
  className = '',
}: {
  provider: Provider;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const tile = { width: size, height: size } as const;

  if (failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-card border border-p-line text-p-ink-3 ${className}`}
        style={tile}
        aria-hidden
      >
        <Boxes size={Math.round(size * 0.6)} strokeWidth={1.5} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={provider.mark}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={provider.wordmark ? { height: size, width: 'auto', maxWidth: size * 2.6 } : tile}
    />
  );
}
