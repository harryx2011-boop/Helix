import { describe, expect, it } from 'vitest';
import { acceptModelFields, assemble, routeStructural } from './enrich.js';
import type { FieldSpec, PageEvidence } from './routing.js';

const URL = 'https://acme.example/about';

const HTML = `<!doctype html><html><head>
<meta property="og:site_name" content="Acme Robotics">
<meta property="og:description" content="Warehouse automation for mid-market distributors.">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Acme Robotics","foundingDate":"2011","numberOfEmployees":240}
</script>
</head><body><p>Acme Robotics is headquartered in Rotterdam, the Netherlands.</p></body></html>`;

const TEXT = 'Acme Robotics is headquartered in Rotterdam, the Netherlands. It was founded in 2011 and employs 240 people.';

const page: PageEvidence = { url: URL, text: TEXT, title: 'Acme Robotics', html: HTML };

const fields: FieldSpec[] = [
  { name: 'name', type: 'string' },
  { name: 'foundingDate', type: 'string' },
  { name: 'headquarters', type: 'string', description: 'City of the head office' },
];

describe('field routing', () => {
  it('answers from metadata and leaves only the rest for the model', () => {
    const { answered, open } = routeStructural(fields, [page]);

    expect(answered.get('name')).toMatchObject({
      value: 'Acme Robotics',
      phase: 'metadata',
      confidence: 'high',
      reason: null,
    });
    expect(answered.get('foundingDate')).toMatchObject({ value: '2011', phase: 'metadata', confidence: 'high' });

    // The model is asked for exactly the field structure could not supply.
    expect(open.map((f) => f.name)).toEqual(['headquarters']);
  });

  it('carries a citation naming where in the document the value was read', () => {
    const { answered } = routeStructural(fields, [page]);
    expect(answered.get('name')?.citation).toMatchObject({ url: URL, locator: 'meta[og:site_name]' });
    expect(answered.get('foundingDate')?.citation?.locator).toBe('ld+json Organization.foundingDate');
  });

  it('asks the model for everything when the page has no structured data', () => {
    const bare: PageEvidence = { url: URL, text: TEXT, html: '<html><body><p>Hello.</p></body></html>' };
    const { answered, open } = routeStructural(fields, [bare]);
    expect(answered.size).toBe(0);
    expect(open).toHaveLength(3);
  });

  it('does not treat a metadata value as structural when the HTML no longer yields it', () => {
    // Same page, HTML withheld: nothing can be re-derived, so nothing is claimed.
    const noHtml: PageEvidence = { url: URL, text: TEXT };
    expect(routeStructural(fields, [noHtml]).answered.size).toBe(0);
  });
});

describe('model answers are accepted only when grounded', () => {
  const open: FieldSpec[] = [{ name: 'headquarters', type: 'string' }];
  const sources = new Map([[URL, TEXT]]);

  it('accepts a grounded value with a verified citation', () => {
    const out = acceptModelFields(open, {
      headquarters: {
        value: 'Rotterdam',
        sourceUrl: URL,
        citation: 'Acme Robotics is headquartered in Rotterdam, the Netherlands.',
      },
    }, sources);

    expect(out.get('headquarters')).toMatchObject({
      value: 'Rotterdam',
      confidence: 'medium',
      phase: 'model',
      reason: null,
      citation: { url: URL, locator: 'body' },
      evidence: { valueInCitation: true },
    });
  });

  it('nulls a hallucinated value whose citation is not in the page', () => {
    const out = acceptModelFields(open, {
      headquarters: {
        value: 'Berlin',
        sourceUrl: URL,
        citation: 'Acme Robotics is headquartered in Berlin, Germany, a fact stated on this page.',
      },
    }, sources);

    expect(out.get('headquarters')).toMatchObject({
      value: null,
      confidence: null,
      citation: null,
      reason: 'citation_not_in_source',
    });
  });

  it('nulls a value smuggled onto a real passage that does not contain it', () => {
    const out = acceptModelFields(open, {
      headquarters: {
        value: 'Berlin',
        sourceUrl: URL,
        citation: 'Acme Robotics is headquartered in Rotterdam, the Netherlands.',
      },
    }, sources);
    expect(out.get('headquarters')).toMatchObject({ value: null, reason: 'value_not_in_citation' });
  });

  it('nulls a value attributed to a page that was never fetched', () => {
    const out = acceptModelFields(open, {
      headquarters: {
        value: 'Rotterdam',
        sourceUrl: 'https://invented.example/page',
        citation: 'Acme Robotics is headquartered in Rotterdam, the Netherlands.',
      },
    }, sources);
    expect(out.get('headquarters')).toMatchObject({ value: null, reason: 'unknown_source_url' });
  });

  it('records not_stated when the model correctly says the page does not say', () => {
    const out = acceptModelFields(open, { headquarters: { value: null, sourceUrl: '', citation: '' } }, sources);
    expect(out.get('headquarters')).toMatchObject({ value: null, reason: 'not_stated', confidence: null });
  });

  it('records not_stated when the model omits the field entirely', () => {
    expect(acceptModelFields(open, {}, sources).get('headquarters')).toMatchObject({
      value: null,
      reason: 'not_stated',
    });
  });

  it('bands a grounded boolean low, because its value cannot be found in its passage', () => {
    const page = new Map([[URL, 'We are hiring across engineering and operations this quarter.']]);
    const out = acceptModelFields([{ name: 'hiring', type: 'boolean' }], {
      hiring: {
        value: true,
        sourceUrl: URL,
        citation: 'We are hiring across engineering and operations this quarter.',
      },
    }, page);

    expect(out.get('hiring')).toMatchObject({
      value: true,
      confidence: 'low',
      evidence: { valueInCitation: false },
    });
  });
});

describe('assembling the final answer', () => {
  it('reports no_sources when nothing was read and nothing rejected', () => {
    const outcome = assemble(fields, new Map(), new Map(), [], []);
    expect(outcome.fields['name']).toMatchObject({ value: null, reason: 'no_sources' });
    expect(outcome.sourcesUsed).toEqual([]);
  });

  it('reports all_sources_rejected when the guardrails discarded every candidate', () => {
    const rejected = [{ url: 'https://acme.example', reason: 'parked_domain' as const, detail: 'parked' }];
    const outcome = assemble(fields, new Map(), new Map(), [], rejected);
    expect(outcome.fields['name']).toMatchObject({ value: null, reason: 'all_sources_rejected' });
    expect(outcome.sourcesRejected).toEqual(rejected);
  });

  it('reports model_unavailable rather than not_stated when the model never ran', () => {
    const outcome = assemble(fields, new Map(), new Map(), [page], [], 'model_unavailable');
    expect(outcome.fields['headquarters']).toMatchObject({ value: null, reason: 'model_unavailable' });
  });

  it('prefers a structural answer over a model one for the same field', () => {
    const structural = routeStructural(fields, [page]).answered;
    const model = acceptModelFields([{ name: 'name', type: 'string' }], {
      name: { value: 'Wrong Name', sourceUrl: URL, citation: TEXT },
    }, new Map([[URL, TEXT]]));

    const outcome = assemble(fields, structural, model, [page], []);
    expect(outcome.fields['name']).toMatchObject({ value: 'Acme Robotics', phase: 'metadata' });
  });

  it('lists the pages that became evidence', () => {
    const outcome = assemble(fields, new Map(), new Map(), [page], []);
    expect(outcome.sourcesUsed).toEqual([URL]);
  });
});

describe('structural routing falls through when the document stops stating a field', () => {
  it('prefers the locator that actually holds the value when a meta tag is absent', () => {
    const tagRemoved: PageEvidence = {
      url: URL,
      text: TEXT,
      html: HTML.replace('<meta property="og:site_name" content="Acme Robotics">', ''),
    };
    const { answered } = routeStructural([{ name: 'name', type: 'string' }], [tagRemoved]);
    expect(answered.get('name')?.citation?.locator).toBe('ld+json Organization.name');
  });

  it('leaves a field open for the model when no structure states it', () => {
    const stripped: PageEvidence = {
      url: URL,
      text: TEXT,
      html: HTML.replace('"foundingDate":"2011",', ''),
    };
    const { answered, open } = routeStructural([{ name: 'foundingDate', type: 'string' }], [stripped]);
    expect(answered.size).toBe(0);
    expect(open.map((f) => f.name)).toEqual(['foundingDate']);
  });
});
