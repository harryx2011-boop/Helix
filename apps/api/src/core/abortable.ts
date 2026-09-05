/**
 * Races an in-flight promise against an abort signal.
 *
 * Some in-flight work has no cancellation hook of its own — Fastify's `inject`
 * runs a handler against a synthetic request/response pair with no socket to
 * close, so the caller disconnecting can only ever stop the *waiting*, never
 * the work itself. This is that: the awaited promise still settles on its own
 * time, but a route can stop blocking the reply on it once the signal fires,
 * the same way `raceInFlight` in the crawl worker stops waiting on in-flight
 * fetches rather than pretending it can cancel them.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
