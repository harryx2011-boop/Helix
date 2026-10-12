import type { MetadataRoute } from 'next';
import { DOCS } from '@/lib/docs';
import { FEATURES } from '@/lib/feature-copy';
import { MARKDOWN_TWIN_PATHS } from '@/lib/markdown-twins';
import { SITE_URL } from '@/lib/mode';

export const dynamic = 'force-static';

const STANDALONE = ['download', 'status', 'privacy', 'terms'];

/** The public marketing and docs pages; the app itself is not on the website. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL.replace(/\/$/, '');
  const paths = new Set<string>([
    '',
    ...STANDALONE,
    ...FEATURES.map((f) => f.route.replace(/^\//, '')),
    ...MARKDOWN_TWIN_PATHS,
    ...DOCS.map((d) => `docs/${d.slug}`),
  ]);
  return [...paths].map((path) => ({ url: path ? `${base}/${path}` : base }));
}
