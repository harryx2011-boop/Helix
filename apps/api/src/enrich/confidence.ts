import type { ExtractorPhase } from './routing.js';

/**
 * Confidence, and what it is honestly allowed to mean here.
 *
 * The temptation is to emit a number like 0.87 and let the caller read it as a
 * probability. It would not be one. Calibrating a probability requires a labelled
 * set to measure against, and this project has none; a model asked to rate its
 * own certainty produces a number that correlates with fluency rather than with
 * being right. Emitting such a number is worse than emitting nothing, because it
 * launders a guess into a measurement, and a caller filtering on `> 0.8` would be
 * filtering on nothing.
 *
 * So confidence here is NOT a probability and is not presented as one. It is an
 * ordinal band derived only from facts the code established itself:
 *
 *   `high`      the value was read out of the document structure by this process
 *               - a meta tag or a JSON-LD property - and re-derived from the
 *               HTML to confirm it. No model was asked. This cannot be a
 *               hallucination; it can still be a page stating something false.
 *
 *   `medium`    a model proposed the value, it quoted a passage, that passage was
 *               found verbatim in the page the code fetched, and the value itself
 *               appears inside that passage. The claim is anchored to real text.
 *
 *   `low`       as `medium`, but the value could not be required to appear inside
 *               its own passage - the boolean case, where a page establishes
 *               `hiring: true` by saying "we are hiring" and never contains the
 *               token "true". The passage is real; the inference from it is the
 *               model's and is unverified.
 *
 * Anything that fails those tests is not assigned a low confidence. It is
 * returned as `null` with a reason, because a wrong value with a caveat is still
 * a wrong value and callers do not read caveats.
 *
 * THE LIMITS, STATED RATHER THAN HIDDEN:
 *   - These bands are not calibrated. `high` is not "90% likely correct"; it is
 *     "obtained by a method that cannot fabricate". No error rate is claimed
 *     because none has been measured.
 *   - Grounding proves the passage exists, not that it is true. A page that
 *     states a falsehood produces a `medium` field quoting it faithfully.
 *   - Agreement across sources is reported as a count, not folded into the band.
 *     Two pages copying one press release are not two pieces of evidence, and
 *     nothing here can tell that apart from genuine corroboration.
 */

export const CONFIDENCE_BANDS = ['high', 'medium', 'low'] as const;

export type Confidence = (typeof CONFIDENCE_BANDS)[number];

export interface ConfidenceInput {
  /** Which phase produced the value. */
  phase: ExtractorPhase;
  /** Whether the value itself was found inside its own cited passage. False for booleans. */
  valueInCitation: boolean;
}

/**
 * The band for one verified field. Only ever called for fields that already
 * passed grounding; an ungrounded field has no confidence because it has no
 * value.
 */
export function bandFor(input: ConfidenceInput): Confidence {
  if (input.phase === 'metadata' || input.phase === 'structural') return 'high';
  return input.valueInCitation ? 'medium' : 'low';
}
