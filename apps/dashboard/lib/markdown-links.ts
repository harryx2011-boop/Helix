/**
 * Link policy for rendered markdown (used on scraped, untrusted page content):
 * only http(s) and mailto become links. A relative URL (no scheme) is same-origin
 * and stays safe. Anything else — `javascript:`, `data:`, `file:`, `vbscript:` —
 * is refused. Mirrors react-markdown's own `defaultUrlTransform` scheme-detection
 * (a colon before the first `/`, `?` or `#` is a protocol), but with a narrower
 * allowlist than upstream's `https?|ircs?|mailto|xmpp`, and closes three holes
 * upstream leaves open: a protocol-relative URL (`//evil.com`, which a browser
 * resolves against the current scheme) has no colon and would otherwise read as
 * "relative"; a backslash (`\\evil.com`, `/\evil.com`) is normalised to `/` by
 * browsers before that same check runs; and a scheme can be smuggled past a raw
 * colon scan by percent- or entity-encoding the colon itself.
 */
const SAFE_PROTOCOL = /^(https?|mailto)$/i;
const HTTP_PROTOCOL = /^https?$/i;
const LEADING_JUNK = /^[\s\u0000-\u001f]+/;
const ENCODED_COLON = /%3a|&#0*58;?|&#x0*3a;?|&colon;?/i;

/** `false` return means "definitely unsafe, stop here"; a string return is the normalised value plus its scheme (`''` when relative). */
function normalizeHref(value: string): { normalized: string; scheme: string } | false {
  // Browsers strip leading control characters and whitespace, and treat a
  // backslash as a path separator the same as a forward slash, before ever
  // looking at scheme or host — normalise the same way before judging safety.
  const normalized = value.replace(LEADING_JUNK, '').replace(/\\/g, '/');

  // "//host/…" (and now-normalised "\\host", "/\host") is protocol-relative:
  // a browser resolves it against the current scheme, so it is never "just a
  // relative path" even though it has no colon.
  if (/^\/\//.test(normalized)) return false;

  // A scheme can be smuggled past the plain-colon scan below by encoding the
  // colon; refuse outright rather than trying to decode and re-check.
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

/** Whether a href is (or resolves as) http(s) — used to decide `target="_blank"`/`rel="noopener noreferrer"`, so it must use the exact same scheme detection `isSafeHref` does, not a separate regex a future edit could drift out of sync with. */
export function isHttpHref(value: string): boolean {
  const result = normalizeHref(value);
  if (!result) return false;
  return HTTP_PROTOCOL.test(result.scheme);
}

/** react-markdown `urlTransform`: passes safe URLs through, drops the rest so no `href` is emitted. */
export function markdownUrlTransform(value: string): string {
  return isSafeHref(value) ? value : '';
}
