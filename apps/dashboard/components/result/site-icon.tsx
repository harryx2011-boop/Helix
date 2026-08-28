'use client';

import * as React from 'react';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

function hostnameFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

interface SiteIconProps {
  url: string;
  /** Overrides the derived Google favicon URL, e.g. `metadata.favicon` once the API supplies it. */
  src?: string | undefined;
  size?: number;
  className?: string;
}

/**
 * Small rounded site favicon for URL/hostname rows, sourced from the same
 * Google favicon service as `public/providers/*.png`. Falls back to a
 * neutral Globe glyph on load failure or an unparseable URL — never a
 * broken-image icon.
 */
export function SiteIcon({ url, src, size = 14, className }: SiteIconProps) {
  const hostname = hostnameFromUrl(url);
  const resolvedSrc = src ?? (hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : undefined);

  // Keyed by the resolved src so a recycled row retries for its new site
  // rather than staying on the fallback glyph.
  const [failedSrc, setFailedSrc] = React.useState<string | undefined>(undefined);
  const failed = resolvedSrc !== undefined && failedSrc === resolvedSrc;

  if (!resolvedSrc || failed) {
    return (
      <Globe
        className={cn('shrink-0 text-muted-foreground', className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- favicon-sized image from the Google favicon service, no next/image benefit
    <img
      src={resolvedSrc}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cn('shrink-0 rounded-card', className)}
      style={{ width: size, height: size }}
      onError={() => setFailedSrc(resolvedSrc)}
    />
  );
}
