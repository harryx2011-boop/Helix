const SAFE_PROTOCOL = /^(https?|mailto)$/i;
const HTTP_PROTOCOL = /^https?$/i;
const LEADING_JUNK = /^[\s\u0000-\u001f]+/;
const ENCODED_COLON = /%3a|&#0*58;?|&#x0*3a;?|&colon;?/i;

function normalizeHref(value: string): { normalized: string; scheme: string } | false {
  const normalized = value.replace(LEADING_JUNK, '').replace(/\\/g, '/');

  if (/^\/\//.test(normalized)) return false;

  if (ENCODED_COLON.test(normalized)) return false;

  const colon = normalized.indexOf(':');
  const questionMark = normalized.indexOf('?');
  const numberSign = normalized.indexOf('#');
  const slash = normalized.indexOf('/');

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign)
  ) {
    return { normalized, scheme: '' };
  }

  return { normalized, scheme: normalized.slice(0, colon) };
}

export function isSafeHref(value: string): boolean {
  const result = normalizeHref(value);
  if (!result) return false;
  return result.scheme === '' || SAFE_PROTOCOL.test(result.scheme);
}

export function isHttpHref(value: string): boolean {
  const result = normalizeHref(value);
  if (!result) return false;
  return HTTP_PROTOCOL.test(result.scheme);
}

export function markdownUrlTransform(value: string): string {
  return isSafeHref(value) ? value : '';
}
