/**
 * What actually runs a conversion, and where a key comes from. These are real
 * projects, so each wears its own mark from `public/providers/` rather than a
 * monogram — a letter tile tells a reader nothing about what is doing the work.
 */

export type ProviderId = 'ffmpeg' | 'sharp' | 'libvips' | 'helix' | 'postgres' | 'vercel';

export type ProviderRole = 'engine' | 'auth' | 'storage' | 'hosting';

export type Provider = {
  id: ProviderId;
  name: string;
  role: ProviderRole;
  /** What it does here, in one line. */
  summary: string;
  /** The file in public/providers. A wordmark is laid out differently. */
  mark: string;
  wordmark?: boolean;
  href: string;
  /** Which operations it powers, for the settings table. */
  handles?: string[];
};

export const PROVIDERS: Provider[] = [
  {
    id: 'ffmpeg',
    name: 'FFmpeg',
    role: 'engine',
    summary: 'Decodes and encodes video, audio and GIF. Spawned per job with a bounded argv.',
    mark: '/providers/ffmpeg.png',
    href: 'https://ffmpeg.org',
    handles: ['convert', 'compress', 'gif'],
  },
  {
    id: 'sharp',
    name: 'sharp',
    role: 'engine',
    summary: 'Still images. Handles HEIC and AVIF, which a stock FFmpeg build does not.',
    mark: '/providers/sharp.png',
    href: 'https://sharp.pixelplumbing.com',
    handles: ['image'],
  },
  {
    id: 'libvips',
    name: 'libvips',
    role: 'engine',
    summary: 'The image library underneath sharp. Its build decides which formats exist.',
    mark: '/providers/libvips.png',
    href: 'https://libvips.org',
  },
  {
    id: 'helix',
    name: 'Helix',
    role: 'auth',
    summary: 'Issues and verifies the API keys every conversion is authorised against.',
    mark: '/providers/helix.svg',
    wordmark: true,
    href: 'https://github.com/harryx2011-boop/Helix',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    role: 'storage',
    summary: 'Holds the hashed keys. Converted files never go in a database.',
    mark: '/providers/postgres.png',
    href: 'https://postgresql.org',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    role: 'hosting',
    summary: 'Serves the frontend. Conversions run on your own machine, not here.',
    mark: '/providers/vercel.png',
    href: 'https://vercel.com',
  },
];

export const ROLE_LABELS: Record<ProviderRole, string> = {
  engine: 'Conversion',
  auth: 'Keys',
  storage: 'Storage',
  hosting: 'Hosting',
};

export const ROLE_ORDER: ProviderRole[] = ['engine', 'auth', 'storage', 'hosting'];

export function providersByRole(role: ProviderRole): Provider[] {
  return PROVIDERS.filter((p) => p.role === role);
}
