import { clipForFence, fence, FENCE_INSTRUCTION } from './fence.js';
import type { FieldSpec, PageEvidence } from './routing.js';

/**
 * The model phase: ask for the fields structure could not answer.
 *
 * The request is shaped so that a hallucination is detectable rather than
 * plausible. Every field must come back as an object carrying the value, the
 * URL it was read from, and the passage that states it, quoted exactly. The
 * model is told that a quote it cannot copy from the page will cause the field
 * to be discarded - not because saying so prevents invention, but because a
 * model that knows the check exists returns `null` more readily than one that
 * does not, and `null` is the answer we want when there is no data.
 *
 * The enforcement is not here. It is in `grounding.ts`, over the text this
 * module fenced, after the model has answered.
 */

/** Per-page share of the model budget, so one long page cannot crowd out every other source. */
export const PER_SOURCE_CHARS = 6_000;

/**
 * The JSON Schema sent to helix-extract for the model phase.
 *
 * Each field is an object rather than a bare scalar. A bare scalar has nowhere
 * to put the citation, and a citation returned in a parallel array cannot be
 * tied back to its field without trusting index alignment.
 */
export function buildSchema(fields: readonly FieldSpec[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const field of fields) {
    properties[field.name] = {
      type: ['object', 'null'],
      description: field.description ?? `The ${field.name} stated by the page, or null if no page states it.`,
      properties: {
        value: {
          type: [field.type, 'null'],
          description: `The ${field.name} exactly as the page states it, or null.`,
        },
        sourceUrl: {
          type: 'string',
          description: 'The URL of the page this value was read from. Must be one of the URLs given.',
        },
        citation: {
          type: 'string',
          description:
            'The sentence from that page which states this value, copied exactly, character for character. ' +
            'It must contain the value. Do not paraphrase, summarise or reconstruct it.',
        },
      },
      required: ['value', 'sourceUrl', 'citation'],
    };
  }

  return { type: 'object', properties, required: fields.map((f) => f.name) };
}

/**
 * The instruction sent alongside the fenced pages.
 *
 * `null` is presented as the correct answer rather than a failure, because the
 * default behaviour of an instruction-tuned model asked for a company's founding
 * year is to produce one. Saying plainly that no answer is better than a guess
 * is the cheapest available lever on that, and the grounding check is what makes
 * it enforceable.
 */
export function buildPrompt(subject: string, fields: readonly FieldSpec[]): string {
  const wanted = fields.map((f) => (f.description ? `- ${f.name}: ${f.description}` : `- ${f.name}`)).join('\n');

  return [
    `Find these facts about ${subject}, using only the page text supplied below.`,
    '',
    wanted,
    '',
    FENCE_INSTRUCTION,
    '',
    'For every field return an object with three keys: `value`, `sourceUrl`, and `citation`.',
    '`citation` must be a sentence copied exactly from one of the pages, and it must contain the value.',
    'A citation that cannot be found in the page it names will cause the field to be discarded.',
    '',
    'If no supplied page states a field, return `value: null` for it with an empty citation.',
    'Returning null is the correct answer when the pages do not say. Do not use knowledge from outside',
    'these pages, do not infer a value from a related one, and never guess a plausible value.',
  ].join('\n');
}

/**
 * The fenced page bundle sent as content.
 *
 * Each page is clipped to its own share of the budget before wrapping, so the
 * clip never lands inside a fence, and every page is told how much of itself was
 * dropped.
 */
export function buildContent(pages: readonly PageEvidence[]): string {
  return pages
    .map((page) => {
      const { payload, omittedChars } = clipForFence(page.text, PER_SOURCE_CHARS);
      return fence(payload, { origin: page.url, omittedChars });
    })
    .join('\n\n');
}
