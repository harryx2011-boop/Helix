import { describe, expect, it } from 'vitest';
import { MIN_CITATION_CHARS, normaliseForMatch, valueAppearsInCitation, verifyGrounding } from './grounding.js';

const URL = 'https://acme.example/about';
const PAGE =
  'Acme Robotics was founded in 2011. The company is headquartered in Rotterdam, ' +
  'the Netherlands, and employs 240 people. We are hiring across engineering.';

const sources = new Map([[URL, PAGE]]);

describe('normalisation', () => {
  it('folds the punctuation an extractor rewrites without folding words together', () => {
    expect(normaliseForMatch('The  “Company”  is  based in  Rotterdam—NL')).toBe(
      normaliseForMatch('the "company" is based in rotterdam-nl'),
    );
    expect(normaliseForMatch('Rotterdam')).not.toBe(normaliseForMatch('Amsterdam'));
  });

  it('leaves a real sentence with content', () => {
    expect(normaliseForMatch(PAGE).length).toBeGreaterThan(50);
  });
});

describe('a grounded field survives', () => {
  it('accepts a value whose citation is in the page and contains it', () => {
    const verdict = verifyGrounding({
      value: 'Rotterdam',
      citation: 'The company is headquartered in Rotterdam, the Netherlands',
      sourceUrl: URL,
      sources,
    });
    expect(verdict).toMatchObject({ grounded: true, sourceUrl: URL });
  });

  it('accepts a citation the model retyped with different punctuation and case', () => {
    const verdict = verifyGrounding({
      value: 'Rotterdam',
      citation: 'the company is headquartered in rotterdam,  the netherlands',
      sourceUrl: URL,
      sources,
    });
    expect(verdict.grounded).toBe(true);
  });

  it('matches a number the page wrote with separators', () => {
    const page = new Map([[URL, 'Annual recurring revenue reached 1,200,000 euro last year.']]);
    const verdict = verifyGrounding({
      value: 1200000,
      citation: 'Annual recurring revenue reached 1,200,000 euro last year.',
      sourceUrl: URL,
      sources: page,
    });
    expect(verdict.grounded).toBe(true);
  });
});

describe('an ungrounded field is rejected', () => {
  it('rejects a citation that does not appear in the page (the fabrication case)', () => {
    const verdict = verifyGrounding({
      value: 'Berlin',
      citation: 'Acme Robotics is headquartered in Berlin, Germany, where it was founded.',
      sourceUrl: URL,
      sources,
    });
    expect(verdict).toEqual({
      grounded: false,
      reason: 'citation_not_in_source',
      detail: 'the supporting passage does not appear in the page it was attributed to',
    });
  });

  it('rejects a real passage reused to carry a value it does not state', () => {
    // The passage is genuinely in the page. The value is not in the passage.
    const verdict = verifyGrounding({
      value: 'Berlin',
      citation: 'The company is headquartered in Rotterdam, the Netherlands',
      sourceUrl: URL,
      sources,
    });
    expect(verdict).toMatchObject({ grounded: false, reason: 'value_not_in_citation' });
  });

  it('rejects a value attributed to a URL that was never read', () => {
    const verdict = verifyGrounding({
      value: 'Rotterdam',
      citation: 'The company is headquartered in Rotterdam, the Netherlands',
      sourceUrl: 'https://elsewhere.example/invented',
      sources,
    });
    expect(verdict).toMatchObject({ grounded: false, reason: 'unknown_source_url' });
  });

  it('rejects a value with no citation at all', () => {
    expect(verifyGrounding({ value: 'Rotterdam', citation: '', sourceUrl: URL, sources })).toMatchObject({
      grounded: false,
      reason: 'no_citation',
    });
  });

  it('rejects a citation too short to identify a passage', () => {
    const verdict = verifyGrounding({ value: 'Rotterdam', citation: 'Rotterdam', sourceUrl: URL, sources });
    expect(verdict).toMatchObject({ grounded: false, reason: 'citation_too_short' });
    expect(normaliseForMatch('Rotterdam').length).toBeLessThan(MIN_CITATION_CHARS);
  });
});

describe('value containment', () => {
  it('requires a string to appear in its citation', () => {
    expect(valueAppearsInCitation('Rotterdam', 'headquartered in Rotterdam today')).toBe(true);
    expect(valueAppearsInCitation('Berlin', 'headquartered in Rotterdam today')).toBe(false);
  });

  it('reports false for a boolean, which cannot appear literally', () => {
    expect(valueAppearsInCitation(true, 'We are hiring across engineering.')).toBe(false);
  });

  it('still grounds a boolean whose passage is real, and marks it as unconfirmed', () => {
    const verdict = verifyGrounding({
      value: true,
      citation: 'We are hiring across engineering.',
      sourceUrl: URL,
      sources,
    });
    expect(verdict.grounded).toBe(true);
  });
});
