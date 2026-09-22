import { describe, expect, it } from 'vitest';
import { matchCommands, slashQuery } from './prompt-commands';

describe('slashQuery', () => {
  it('is undefined for an empty field or ordinary text', () => {
    expect(slashQuery('')).toBeUndefined();
    expect(slashQuery('nextjs.org/docs')).toBeUndefined();
    expect(slashQuery('transactional email APIs')).toBeUndefined();
  });

  it('returns the word after a lone leading slash', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/scr')).toBe('scr');
  });

  it('treats a path, a phrase or a second line as text rather than a command', () => {
    expect(slashQuery('/docs/api')).toBeUndefined();
    expect(slashQuery('/scrape this')).toBeUndefined();
    expect(slashQuery('/a\nb')).toBeUndefined();
  });
});

describe('matchCommands', () => {
  const items = [
    { id: 'scrape', label: 'Scrape' },
    { id: 'screenshot', label: 'Screenshot' },
    { id: 'search', label: 'Search' },
    { id: 'parse', label: 'Parse' },
  ];

  it('returns every item, in order, for an empty query', () => {
    expect(matchCommands(items, '').map((i) => i.id)).toEqual(['scrape', 'screenshot', 'search', 'parse']);
  });

  it('ranks prefix matches before substring matches, case-insensitively', () => {
    expect(matchCommands(items, 'SE').map((i) => i.id)).toEqual(['search', 'parse']);
    expect(matchCommands(items, 'scr').map((i) => i.id)).toEqual(['scrape', 'screenshot']);
  });

  it('returns nothing when no item matches', () => {
    expect(matchCommands(items, 'zzz')).toEqual([]);
  });
});
