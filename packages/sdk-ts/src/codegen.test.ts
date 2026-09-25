import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSpec } from '../../../apps/api/src/mcp/spec.js';
import { OUTPUT_PATH, SPEC_PATH, outputs, render } from '../codegen/generate.js';

const committed = () => readFileSync(OUTPUT_PATH, 'utf8').replace(/\r\n/g, '\n');

describe('generated client', () => {
  it.each(outputs().map((o) => [o.path, o] as const))(
    '%s is what openapi.yaml and codegen/methods.ts generate (run `npm run generate` if not)',
    (_path, o) => {
      expect(o.current).toBe(o.expected);
    },
  );

  it('goes stale when an operation in the spec changes', () => {
    const spec = loadSpec(SPEC_PATH);
    spec.paths['/crawl/price'] = spec.paths['/crawl/estimate']!;
    delete spec.paths['/crawl/estimate'];
    expect(committed()).not.toBe(render(spec));
  });

  it('refuses a spec operation the SDK has made no decision about', () => {
    const spec = loadSpec(SPEC_PATH);
    spec.paths['/brand-new'] = { get: { operationId: 'brandNew', responses: { '200': { description: 'ok' } } } };
    expect(() => render(spec)).toThrow(/brandNew/);
  });

  it('refuses a method row whose operation has left the spec', () => {
    const spec = loadSpec(SPEC_PATH);
    delete spec.paths['/crawl/estimate'];
    expect(() => render(spec)).toThrow(/estimateCrawl/);
  });
});
