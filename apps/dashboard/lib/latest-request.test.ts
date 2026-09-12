import { describe, expect, it } from 'vitest';
import { createLatest } from './latest-request';

describe('createLatest', () => {
  it('only the most recently issued id is current', () => {
    const latest = createLatest();
    const first = latest.next();
    const second = latest.next();
    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(true);
  });

  it('an earlier id goes stale once a third is issued', () => {
    const latest = createLatest();
    const first = latest.next();
    const second = latest.next();
    const third = latest.next();
    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(false);
    expect(latest.isCurrent(third)).toBe(true);
  });
});
