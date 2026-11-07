
export const GROUNDING_REJECTIONS = [
  'no_citation',
  'citation_not_in_source',
  'value_not_in_citation',
  'citation_too_short',
  'unknown_source_url',
] as const;

export type GroundingRejection = (typeof GROUNDING_REJECTIONS)[number];

export const MIN_CITATION_CHARS = 24;

export function normaliseForMatch(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[•‣◦⁃]/g, '*')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface GroundingInput {
  value: unknown;
  citation: string;
  sourceUrl: string;
  sources: ReadonlyMap<string, string>;
}

export type GroundingVerdict =
  | { grounded: true; sourceUrl: string; quote: string }
  | { grounded: false; reason: GroundingRejection; detail: string };

function valueAsText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

export function valueAppearsInCitation(value: unknown, citation: string): boolean {
  const text = valueAsText(value);
  if (text === undefined) return false;
  if (typeof value === 'boolean') return false;

  const haystack = normaliseForMatch(citation);
  const needle = normaliseForMatch(text);
  if (needle.length === 0) return false;
  if (haystack.includes(needle)) return true;

  if (typeof value === 'number') {
    const digits = needle.replace(/[,\s]/g, '');
    return haystack.replace(/[,\s]/g, '').includes(digits);
  }

  return false;
}

export function verifyGrounding(input: GroundingInput): GroundingVerdict {
  const citation = typeof input.citation === 'string' ? input.citation.trim() : '';

  if (citation.length === 0) {
    return { grounded: false, reason: 'no_citation', detail: 'the model returned a value with no supporting passage' };
  }

  if (normaliseForMatch(citation).length < MIN_CITATION_CHARS) {
    return {
      grounded: false,
      reason: 'citation_too_short',
      detail: `the supporting passage is shorter than the ${MIN_CITATION_CHARS} characters needed to identify it in the page`,
    };
  }

  const content = input.sources.get(input.sourceUrl);
  if (content === undefined) {
    return {
      grounded: false,
      reason: 'unknown_source_url',
      detail: `the model attributed the value to ${input.sourceUrl || 'no URL'}, which is not among the pages that were read`,
    };
  }

  if (!normaliseForMatch(content).includes(normaliseForMatch(citation))) {
    return {
      grounded: false,
      reason: 'citation_not_in_source',
      detail: 'the supporting passage does not appear in the page it was attributed to',
    };
  }

  if (typeof input.value !== 'boolean' && !valueAppearsInCitation(input.value, citation)) {
    return {
      grounded: false,
      reason: 'value_not_in_citation',
      detail: 'the supporting passage is real but does not contain the value it was cited for',
    };
  }

  return { grounded: true, sourceUrl: input.sourceUrl, quote: citation };
}
