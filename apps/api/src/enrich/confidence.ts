import type { ExtractorPhase } from './routing.js';


export const CONFIDENCE_BANDS = ['high', 'medium', 'low'] as const;

export type Confidence = (typeof CONFIDENCE_BANDS)[number];

export interface ConfidenceInput {
  phase: ExtractorPhase;
  valueInCitation: boolean;
}

export function bandFor(input: ConfidenceInput): Confidence {
  if (input.phase === 'metadata' || input.phase === 'structural') return 'high';
  return input.valueInCitation ? 'medium' : 'low';
}
