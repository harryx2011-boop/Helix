import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/mode';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/$/, '');
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/app/'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
