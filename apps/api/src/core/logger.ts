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
