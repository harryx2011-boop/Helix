import { describe, expect, it } from 'vitest';
import { FORMAT_PAIRS, KIND_ORDER, OUTPUT_TARGETS, findPair, pairsByKind } from '@/lib/formats';
import { DOC_TARGETS, docTargetsFor, isDocFormat } from '../documents';

const docPairs = pairsByKind('document');

describe('generated document pairs', () => {
  it('generates a route for every pair the engine can actually do', () => {
    // xls is deliberately excluded as a source (see documentPairs()).
    const expected = Object.entries(DOC_TARGETS)
      .filter(([from]) => from !== 'xls')
      .reduce((n, [, targets]) => n + targets.length, 0);
    expect(docPairs).toHaveLength(expected);
  });

  it('never generates a pair the worker would refuse', () => {
    for (const p of docPairs) {
      expect(docTargetsFor(p.from), `${p.slug}`).toContain(p.to);
    }
  });

  it('gives every pair a unique slug across the whole manifest', () => {
    const slugs = FORMAT_PAIRS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('routes every document pair through the document op', () => {
    for (const p of docPairs) {
      expect(p.op, p.slug).toBe('document');
      expect(isDocFormat(p.from), p.slug).toBe(true);
      expect(isDocFormat(p.to), p.slug).toBe(true);
    }
  });

  it('is reachable by slug like every other pair', () => {
    expect(findPair('csv-to-xlsx')?.kind).toBe('document');
    expect(findPair('pdf-to-txt')?.to).toBe('txt');
    expect(findPair('md-to-html')?.from).toBe('md');
    // Never generated, because a PDF cannot honestly become a spreadsheet.
    expect(findPair('pdf-to-xlsx')).toBeUndefined();
  });

  it('gives each pair a description rather than falling through to nothing', () => {
    for (const p of docPairs) {
      expect(p.description.length, p.slug).toBeGreaterThan(20);
      expect(p.title, p.slug).toContain('to');
    }
  });
});

describe('document kind wiring', () => {
  it('is in the kind order so the tools page lists it', () => {
    expect(KIND_ORDER).toContain('document');
  });

  it('has picker targets that are all real document formats', () => {
    const targets = OUTPUT_TARGETS.document;
    for (const t of [...targets.likely, ...targets.all]) {
      expect(isDocFormat(t), t).toBe(true);
    }
    // `likely` must be a subset of `all`, or the picker shows a chip the
    // popover cannot find.
    for (const t of targets.likely) expect(targets.all).toContain(t);
  });
});
