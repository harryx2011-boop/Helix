/**
 * Link policy for rendered markdown (used on scraped, untrusted page content):
 * only http(s) and mailto become links. A relative URL (no scheme) is same-origin
 * and stays safe. Anything else — `javascript:`, `data:`, `file:`, `vbscript:` —
 * is refused. Mirrors react-markdown's own `defaultUrlTransform` scheme-detection
 * (a colon before the first `/`, `?` or `#` is a protocol), but with a narrower
 * allowlist than upstream's `https?|ircs?|mailto|xmpp`.
 */
const SAFE_PROTOCOL = /^(https?|mailto)$/i;

export function isSafeHref(value: string): boolean {
  const colon = value.indexOf(':');
  const questionMark = value.indexOf('?');
  const numberSign = value.indexOf('#');
  const slash = value.indexOf('/');

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign)
  ) {
    return true;
  }

  return SAFE_PROTOCOL.test(value.slice(0, colon));
}

/** react-markdown `urlTransform`: passes safe URLs through, drops the rest so no `href` is emitted. */
export function markdownUrlTransform(value: string): string {
  return isSafeHref(value) ? value : '';
}
