/**
 * Guards against a slower earlier async response landing after a faster later
 * one. Call `next()` before issuing a request, and only apply a response when
 * `isCurrent(id)` still holds true when it comes back.
 */
export function createLatest(): { next: () => number; isCurrent: (id: number) => boolean } {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (id: number) => id === current,
  };
}
