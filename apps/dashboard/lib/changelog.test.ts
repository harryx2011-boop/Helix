import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  compareSemver,
  formatDate,
  groupBySeries,
  seriesOf,
  validateChangelog,
  versionId,
  type ChangelogEntry,
} from './changelog';

const entry = (over: Partial<ChangelogEntry>): ChangelogEntry => ({
  version: '1.0.0',
  date: '2026-01-01',
  kind: 'tagged',
  commit: 'abcdef1',
  lead: 'A lead.',
  body: ['One sentence.'],
  ...over,
});

describe('CHANGELOG data', () => {
  it('is sound: shape, order, dates and voice', () => {
    expect(validateChangelog(CHANGELOG)).toEqual([]);
  });

  it('descends strictly by version with one entry per version', () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < versions.length; i += 1) {
      expect(compareSemver(versions[i - 1]!, versions[i]!)).toBeGreaterThan(0);
    }
  });

  it('starts at the root manifest version', async () => {
    const { default: pkg } = await import('../package.json');
    expect(CHANGELOG[0]?.version).toBe(pkg.version);
  });

  it('gives every minor and major release a lead', () => {
    for (const e of CHANGELOG) {
      if (e.kind !== 'baseline' && e.version.endsWith('.0')) expect(e.lead, e.version).toBeTruthy();
    }
  });
});

describe('validateChangelog', () => {
  it('flags an ascending pair', () => {
    const problems = validateChangelog([entry({ version: '1.0.0' }), entry({ version: '1.1.0' })]);
    expect(problems.join('\n')).toMatch(/must descend/);
  });

  it('flags a duplicate version', () => {
    expect(validateChangelog([entry({}), entry({})]).join('\n')).toMatch(/listed twice/);
  });

  it('flags a missing lead on a minor release', () => {
    const { lead: _lead, ...rest } = entry({ version: '1.2.0' });
    expect(validateChangelog([rest as ChangelogEntry]).join('\n')).toMatch(/needs a lead/);
  });

  it('flags voice breaks', () => {
    const bad = entry({ body: ['This is amazing! It is seamless — really.'] });
    const text = validateChangelog([bad]).join('\n');
    expect(text).toMatch(/exclamation/);
    expect(text).toMatch(/hype word/);
  });

  it('flags a bad date and an empty body', () => {
    const text = validateChangelog([entry({ date: '2026-13-40', body: [] })]).join('\n');
    expect(text).toMatch(/date/);
    expect(text).toMatch(/body is empty/);
  });
});

describe('helpers', () => {
  it('builds anchor ids and series labels', () => {
    expect(versionId('2.3.2')).toBe('v2-3-2');
    expect(seriesOf('1.10.3')).toBe('1.10');
  });

  it('groups by minor series without reordering', () => {
    const groups = groupBySeries(CHANGELOG);
    expect(groups.flatMap((g) => g.entries.map((e) => e.version))).toEqual(CHANGELOG.map((e) => e.version));
    expect(groups[0]).toMatchObject({ label: '2.3', id: 'series-2-3' });
    expect(groups.find((g) => g.label === '1.11')?.entries.map((e) => e.version)).toEqual(['1.11.3', '1.11.2', '1.11.1', '1.11.0']);
  });

  it('formats dates without a locale or time zone', () => {
    expect(formatDate('2026-10-07')).toBe('October 7, 2026');
  });

  it('compares versions numerically, not as text', () => {
    expect(compareSemver('1.10.0', '1.9.2')).toBeGreaterThan(0);
  });
});
