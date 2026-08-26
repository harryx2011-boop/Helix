/**
 * The logging surface our modules actually use.
 *
 * Structurally compatible with both pino's `Logger` and Fastify's
 * `FastifyBaseLogger`, which differ in ways that are irrelevant here. Depending
 * on this instead of either concrete type keeps the core free of a web-framework
 * import and lets tests pass a plain object.
 */
export interface Log {
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * Request URLs go into the access log. The live-view token travels in the
 * query string, since a browser tab cannot send a header, so it is scrubbed
 * before the URL is logged: a log line must never be enough to attach to a
 * running session.
 */
export function redactUrlToken(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/gi, '$1[redacted]');
}

/**
 * Scrub anything key-shaped from text that came from somewhere else.
 *
 * An upstream error is quoted back to the caller so they can act on it, but a
 * provider's own message may echo the credential it rejected — OpenAI answers a
 * bad key with `Incorrect API key provided: sk-inval************-000`. That echo
 * tells the caller nothing they did not already know, and it has no business in
 * a response body or a log line.
 */
export function redactSecrets(text: string): string {
  return text
    // Provider key prefixes, the partially-masked forms providers echo included.
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_*-]*\*+[A-Za-z0-9_*-]*/g, '[redacted]')
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    // Google and Gemini keys.
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, '[redacted]')
    // Anything naming itself a key or token, followed by its value.
    .replace(/\b(api[_-]?key|token|bearer)\b(\s*[:=]\s*|\s+)[A-Za-z0-9._*-]{8,}/gi, '$1$2[redacted]');
}
