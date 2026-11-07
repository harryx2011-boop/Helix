import type { Endpoint } from './endpoints';

export const UPLOAD_ACCEPT = {
  parse: '.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg',
  metadata: '.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg',
} as const satisfies Partial<Record<Endpoint, string>>;

export function uploadAccept(id: Endpoint): string | undefined {
  return id in UPLOAD_ACCEPT ? UPLOAD_ACCEPT[id as keyof typeof UPLOAD_ACCEPT] : undefined;
}
