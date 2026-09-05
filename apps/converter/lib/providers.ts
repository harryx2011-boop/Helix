/**
 * What actually runs a conversion, and where the app is hosted. These are
 * real projects, so each wears its own mark from `public/providers/` rather
 * than a monogram — a letter tile tells a reader nothing about what is doing
 * the work. Libraries with no distinct visual identity of their own (the
 * jsquash codec set, libheif-js, utif2) are named in prose in the section
 * below rather than given a fabricated mark.
 */

export type ProviderId = 'ffmpeg' | 'vercel';

export type ProviderRole = 'engine' | 'hosting';

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
};

export const PROVIDERS: Provider[] = [
  {
    id: 'ffmpeg',
    name: 'FFmpeg',
    role: 'engine',
    summary: 'Decodes and encodes video, audio and GIF, compiled to WebAssembly and run in a Web Worker.',
    mark: '/providers/ffmpeg.png',
    href: 'https://ffmpeg.org',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    role: 'hosting',
    summary: 'Serves the app. Every conversion still runs on your own machine, never here.',
    mark: '/providers/vercel.png',
    href: 'https://vercel.com',
  },
];

export const ROLE_LABELS: Record<ProviderRole, string> = {
  engine: 'Conversion',
  hosting: 'Hosting',
};

export const ROLE_ORDER: ProviderRole[] = ['engine', 'hosting'];

export function providersByRole(role: ProviderRole): Provider[] {
  return PROVIDERS.filter((p) => p.role === role);
}
