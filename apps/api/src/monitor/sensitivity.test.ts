import { describe, expect, it } from 'vitest';
import { normalizeForComparison } from './sensitivity.js';

describe('normalizeForComparison', () => {
  it('leaves text alone at `any`', () => {
    const text = 'Updated 2 minutes ago\n\n\nPrice: $29';
    expect(normalizeForComparison(text, 'any')).toBe(text);
  });

  it('makes relative-timestamp churn compare equal at `significant`', () => {
    const a = 'Updated 2 minutes ago. Price: $29';
    const b = 'Updated 14 minutes ago. Price: $29';
    expect(normalizeForComparison(a, 'significant')).toBe(normalizeForComparison(b, 'significant'));
  });

  it('still sees a real change through the noise', () => {
    const a = 'Updated 2 minutes ago. Price: $29';
    const b = 'Updated 14 minutes ago. Price: $34';
    expect(normalizeForComparison(a, 'significant')).not.toBe(normalizeForComparison(b, 'significant'));
  });

  it('strips clock times, dates and ISO timestamps', () => {
    const a = 'Last build 12:04 pm on Aug 24, 2026 (2026-08-24T12:04:00Z) 24/08/2026';
    const b = 'Last build 1:15 am on Sep 3 (2026-09-03T01:15:00Z) 03/09/2026';
    expect(normalizeForComparison(a, 'significant')).toBe(normalizeForComparison(b, 'significant'));
  });

  it('ignores rotating tracking parameters in links', () => {
    const a = 'See [pricing](https://example.com/pricing?utm_source=a1&v=1723)';
    const b = 'See [pricing](https://example.com/pricing?utm_source=b2&v=1724)';
    expect(normalizeForComparison(a, 'significant')).toBe(normalizeForComparison(b, 'significant'));
  });

  it('collapses whitespace differences', () => {
    const a = 'Standard\n\n\n\n$29   per month';
    const b = 'Standard\n\n$29 per month';
    expect(normalizeForComparison(a, 'significant')).toBe(normalizeForComparison(b, 'significant'));
  });
});
