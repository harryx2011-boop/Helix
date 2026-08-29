/**
 * Grounding: does the passage the model cited actually exist in the page?
 *
 * This is the control the whole endpoint rests on. Everything upstream —
 * guardrails, routing, fencing — reduces the chance the model invents a value.
 * None of it removes that chance, because a language model asked for a company
 * headquarters will produce a plausible city whether or not the page named one.
 *
 * So enrichment does not trust the answer. It requires the model to quote the
 * span of the page that states the value, and then checks that quote against the
 * bytes actually fetched. A quote that is not in the page discards the field —
 * the value becomes null with a reason, and the caller is told the model could
 * not point at where it read the value.
 *
 * That converts fabrication from an invisible failure into a visible one. It
 * does NOT verify that the passage means what the model claimed, only that the
 * passage is real and that the value appears within it. A page that lies is
 * still quoted faithfully; grounding is a check against the model, not against
 * the web.
 *
 * Matching is deliberately forgiving about form and strict about substance.
 * Whitespace, case and the punctuation that markdown extraction rewrites
 * (smart quotes, dashes, bullet glyphs) are normalised away, because a model
 * re-typing a passage will not reproduce them byte for byte and failing it for
 * that would discard true values. Word content is not normalised away: an exact
 * normalised substring is required, so the model cannot pass by quoting
 * something merely similar.
 */

/** Why a field the model returned did not survive verification. */
export const GROUNDING_REJECTIONS = [
  'no_citation',
  'citation_not_in_source',
  'value_not_in_citation',
  'citation_too_short',
  'unknown_source_url',
] as const;

export type GroundingRejection = (typeof GROUNDING_REJECTIONS)[number];

/**
 * Shortest passage that can ground a value. Below this a "quote" is a fragment
 * that would match somewhere in almost any page by chance, which makes the
 * check pass without the check meaning anything.
 */
export const MIN_CITATION_CHARS = 24;

/**
 * Fold the characters an extractor or a re-typing model rewrites, and nothing
 * else. Quote glyphs, dash glyphs, bullets and non-breaking spaces collapse to
 * their ASCII form; letters and digits are untouched, so this cannot make two
 * different words compare equal.
 */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[•‣◦⁃]/g, '*')
    .replace(/[  -​  　]/g, ' ')
    .replace(/[*_`#>|]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface GroundingInput {
  /** The value the model claims the page states. */
  value: unknown;
  /** The passage the model says states it. */
  citation: string;
  /** The URL the model attributed the passage to. */
  sourceUrl: string;
  /** Fetched page text, keyed by the URL it came from. The code owns this map; the model does not. */
  sources: ReadonlyMap<string, string>;
}

export type GroundingVerdict =
  | { grounded: true; sourceUrl: string; quote: string }
  | { grounded: false; reason: GroundingRejection; detail: string };

/** Scalars a citation can be checked to contain. Objects and arrays are grounded by their leaves elsewhere. */
function valueAsText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/**
 * Whether a claimed value appears inside its own claimed passage.
 *
 * Strings and numbers must appear literally, after normalisation: a citation
 * that does not contain the value it supposedly states is not evidence for it,
 * and this is what stops a real passage being reused to launder an invented
 * value.
 *
 * Booleans are exempt, and this is a real limit rather than an oversight. A page
 * that establishes `hiring: true` does so by saying "we are hiring", never by
 * containing the token "true". For a boolean the check degrades to "the passage
 * is real and the model chose it", which is weaker, so booleans carry the
 * `evidence.valueInCitation: false` marker in the response rather than being
 * silently treated as equally verified.
 */
export function valueAppearsInCitation(value: unknown, citation: string): boolean {
  const text = valueAsText(value);
  if (text === undefined) return false;
  if (typeof value === 'boolean') return false;

  const haystack = normaliseForMatch(citation);
  const needle = normaliseForMatch(text);
  if (needle.length === 0) return false;
  if (haystack.includes(needle)) return true;

  if (typeof value === 'number') {
    // 1200000 in the page as "1,200,000"; 0.5 as ".5". Digits are compared
    // without their separators, which is a rewriting of form, not of substance.
    const digits = needle.replace(/[,\s]/g, '');
    return haystack.replace(/[,\s]/g, '').includes(digits);
  }

  return false;
}

/**
 * Verify one field the model returned against the pages the code actually
 * fetched. Returns the grounded citation, or the reason the field must become
 * null.
 */
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

  // The model names a URL; only a URL the code fetched is admissible. This is
  // the allowlist half of the check — a citation attributed to a page that was
  // never read cannot be verified against anything.
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
