'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/** The static export cannot run `redirects()`, so `/` forwards to the app from the client. */
export default function RootPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace('/app');
  }, [router]);
  return null;
}
