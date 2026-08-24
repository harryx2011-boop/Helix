import { describe, expect, it } from 'vitest';
import { diffText } from './diff.js';
import { evaluateTrigger } from './triggers.js';

const input = (before: string | null, after: string) => ({
  before,
  after,
  diff: diffText(before ?? '', after, 'word'),
});

describe('evaluateTrigger', () => {
  it('fires on any change when no trigger is set', () => {
    expect(evaluateTrigger({}, input('a b c', 'a b d'))).toEqual({ fire: true, reason: 'changed' });
  });

  it('fires when a keyword appears, case-insensitively', () => {
    const trigger = { keywordAppears: 'in stock' };
    expect(evaluateTrigger(trigger, input('Out of stock', 'Now In Stock'))).toEqual({
      fire: true,
      reason: 'keyword_appeared',
    });
    expect(evaluateTrigger(trigger, input('In stock today', 'In stock now'))).toEqual({
      fire: false,
      reason: 'keyword_not_met',
    });
  });

  it('fires when a keyword disappears', () => {
    const trigger = { keywordDisappears: 'Out of stock' };
    expect(evaluateTrigger(trigger, input('Out of stock', 'Ships tomorrow'))).toEqual({
      fire: true,
      reason: 'keyword_disappeared',
    });
    expect(evaluateTrigger(trigger, input('Ships tomorrow', 'Ships today'))).toEqual({
      fire: false,
      reason: 'keyword_not_met',
    });
  });

  it('never treats a first snapshot as a disappearance', () => {
    expect(evaluateTrigger({ keywordDisappears: 'sale' }, input(null, 'no discounts'))).toEqual({
      fire: false,
      reason: 'keyword_not_met',
    });
  });

  it('suppresses changes below the minimum ratio', () => {
    const before = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    const after = before.replace('w50', 'w50x');
    expect(evaluateTrigger({ minChangeRatio: 0.1 }, input(before, after))).toEqual({
      fire: false,
      reason: 'below_min_change',
    });
    expect(evaluateTrigger({ minChangeRatio: 0.01 }, input(before, after)).fire).toBe(true);
  });
});
