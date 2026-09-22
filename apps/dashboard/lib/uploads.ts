import type { Endpoint } from './endpoints';

/**
 * The `accept` list for every endpoint that takes a multipart `file`. The
 * endpoint's form and the prompt box's paperclip both read it here, so the
 * two cannot disagree; an endpoint absent from this map takes no upload and
 * the box shows no paperclip for it.
 */
export const UPLOAD_ACCEPT = {
  parse: '.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg',
  metadata: '.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg',
  convert: '.pdf,.png,.jpg,.jpeg',
} as const satisfies Partial<Record<Endpoint, string>>;

export function uploadAccept(id: Endpoint): string | undefined {
  return id in UPLOAD_ACCEPT ? UPLOAD_ACCEPT[id as keyof typeof UPLOAD_ACCEPT] : undefined;
}
