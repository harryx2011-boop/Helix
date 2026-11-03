import { clipForFence, fence, FENCE_INSTRUCTION } from './fence.js';
import type { FieldSpec, PageEvidence } from './routing.js';


export const PER_SOURCE_CHARS = 6_000;

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

export function buildContent(pages: readonly PageEvidence[]): string {
  return pages
    .map((page) => {
      const { payload, omittedChars } = clipForFence(page.text, PER_SOURCE_CHARS);
      return fence(payload, { origin: page.url, omittedChars });
    })
    .join('\n\n');
}
