'use client';

import * as React from 'react';
import { Globe } from '@/components/icons/lucide';
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
  src?: string | undefined;
  size?: number;
  className?: string;
}

export function SiteIcon({ url, src, size = 14, className }: SiteIconProps) {
  const hostname = hostnameFromUrl(url);
  const resolvedSrc = src ?? (hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : undefined);

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
