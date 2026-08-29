import { bandFor, type Confidence } from './confidence.js';
import { verifyGrounding, valueAppearsInCitation, type GroundingRejection } from './grounding.js';
import { runMetadataPhase, type ExtractorPhase, type FieldSpec, type PageEvidence } from './routing.js';
import type { SourceRejection } from './guards.js';

/**
 * The enrichment core: turn screened pages into fields that are either grounded
 * or null.
 *
 * Pure. Every input is already-fetched content and an already-returned model
 * answer, so the whole decision path - routing, verification, the reason a field
 * is null - is testable without a network, a model or a database.
 *
 * The invariant this file exists to hold, stated once: NO VALUE REACHES THE
 * CALLER THAT THE CODE COULD NOT TIE TO TEXT IT FETCHED ITSELF. A field the
 * model claimed but could not ground is not downgraded, flagged or annotated. It
 * is null, with the reason it is null.
 */

/** Every reason a field can come back null. A closed set, so a caller can branch on it. */
export const NULL_REASONS = [
  'no_sources',
  'all_sources_rejected',
  'not_stated',
  'no_citation',
  'citation_not_in_source',
  'value_not_in_citation',
  'citation_too_short',
  'unknown_source_url',
  'model_unavailable',
] as const;

export type NullReason = (typeof NULL_REASONS)[number];

export interface Citation {
  url: string;
  /** The passage that states the value, verified to appear in the fetched page. */
  quote: string;
  /** Where in the page it was read: an element for a structural hit, `body` for a model hit. */
  locator: string;
}

export interface EnrichedField {
  value: string | number | boolean | null;
  confidence: Confidence | null;
  /** Null when `value` is null; a verified citation otherwise. */
  citation: Citation | null;
  /** Which phase produced the value. Null when none did. */
  phase: ExtractorPhase | null;
  /** Why `value` is null. Null when a value was found. */
  reason: NullReason | null;
  /** How the value was established, in the code own terms. */
  evidence: {
    /** Whether the value itself was found inside its cited passage. False for booleans, which cannot be. */
    valueInCitation: boolean;
    /** How many screened pages were searched for this field. */
    sourcesConsidered: number;
  };
}

function nullField(reason: NullReason, sourcesConsidered: number): EnrichedField {
  return {
    value: null,
    confidence: null,
    citation: null,
    phase: null,
    reason,
    evidence: { valueInCitation: false, sourcesConsidered },
  };
}

/** Grounding rejections map one-to-one onto null reasons; the sets are deliberately the same words. */
function reasonFor(rejection: GroundingRejection): NullReason {
  return rejection;
}

/**
 * Phase one and two: try to answer each field from page structure.
 *
 * Returns the fields that were answered and the fields still open. Only the open
 * ones are worth a model call, which is the entire point of routing: a page with
 * a JSON-LD Organization block answers `name`, `description` and `foundingDate`
 * for free, and asking a model for them costs money to get a worse answer.
 */
export function routeStructural(
  fields: readonly FieldSpec[],
  pages: readonly PageEvidence[],
): { answered: Map<string, EnrichedField>; open: FieldSpec[] } {
  const answered = new Map<string, EnrichedField>();
  const open: FieldSpec[] = [];

  for (const field of fields) {
    let hit: EnrichedField | undefined;

    for (const page of pages) {
      const candidate = runMetadataPhase(field, page);
      if (!candidate) continue;

      hit = {
        value: candidate.value,
        confidence: bandFor({ phase: candidate.phase, valueInCitation: true }),
        citation: { url: candidate.sourceUrl, quote: candidate.citation, locator: candidate.locator },
        phase: candidate.phase,
        reason: null,
        evidence: { valueInCitation: true, sourcesConsidered: pages.length },
      };
      break;
    }

    if (hit) answered.set(field.name, hit);
    else open.push(field);
  }

  return { answered, open };
}

/** One field as the model is asked to return it. Every part of this is a claim, not a fact. */
interface ModelClaim {
  value?: unknown;
  sourceUrl?: unknown;
  citation?: unknown;
}

function asClaim(raw: unknown): ModelClaim | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as ModelClaim;
  return undefined;
}

/**
 * Phase three: accept only what can be verified.
 *
 * `sources` is built by the caller from pages the code fetched, so it is an
 * allowlist the model cannot add to. A citation attributed to a URL that is not
 * in it fails for that reason alone, which is what stops the model laundering a
 * fabricated value through a plausible-looking URL.
 */
export function acceptModelFields(
  fields: readonly FieldSpec[],
  raw: Record<string, unknown>,
  sources: ReadonlyMap<string, string>,
): Map<string, EnrichedField> {
  const out = new Map<string, EnrichedField>();
  const considered = sources.size;

  for (const field of fields) {
    const claim = asClaim(raw[field.name]);

    if (!claim || claim.value === null || claim.value === undefined) {
      // The model said the pages do not state it. That is a real answer, and the
      // one this endpoint is built to make safe to give.
      out.set(field.name, nullField('not_stated', considered));
      continue;
    }

    const value = claim.value;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      out.set(field.name, nullField('not_stated', considered));
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      out.set(field.name, nullField('not_stated', considered));
      continue;
    }

    const verdict = verifyGrounding({
      value,
      citation: typeof claim.citation === 'string' ? claim.citation : '',
      sourceUrl: typeof claim.sourceUrl === 'string' ? claim.sourceUrl : '',
      sources,
    });

    if (!verdict.grounded) {
      out.set(field.name, nullField(reasonFor(verdict.reason), considered));
      continue;
    }

    const valueInCitation = valueAppearsInCitation(value, verdict.quote);

    out.set(field.name, {
      value,
      confidence: bandFor({ phase: 'model', valueInCitation }),
      citation: { url: verdict.sourceUrl, quote: verdict.quote, locator: 'body' },
      phase: 'model',
      reason: null,
      evidence: { valueInCitation, sourcesConsidered: considered },
    });
  }

  return out;
}

export interface RejectedSource {
  url: string;
  reason: SourceRejection;
  detail: string;
}

export interface EnrichOutcome {
  fields: Record<string, EnrichedField>;
  /** Pages that became evidence, in the order they were read. */
  sourcesUsed: string[];
  /** Pages that were fetched and discarded, with the guardrail that discarded them. */
  sourcesRejected: RejectedSource[];
}

/**
 * Assemble the final answer from the structural pass and the verified model
 * pass, filling anything neither produced with an explicit reason.
 *
 * `modelReason` is how the caller says the model phase did not run - no provider
 * configured, or it failed - so that a field left open by routing comes back as
 * `model_unavailable` rather than the untrue `not_stated`.
 */
export function assemble(
  fields: readonly FieldSpec[],
  structural: ReadonlyMap<string, EnrichedField>,
  model: ReadonlyMap<string, EnrichedField>,
  pages: readonly PageEvidence[],
  rejected: readonly RejectedSource[],
  modelReason?: NullReason | undefined,
): EnrichOutcome {
  const out: Record<string, EnrichedField> = {};

  for (const field of fields) {
    const answer = structural.get(field.name) ?? model.get(field.name);
    if (answer) {
      out[field.name] = answer;
      continue;
    }
    if (pages.length === 0) {
      out[field.name] = nullField(rejected.length > 0 ? 'all_sources_rejected' : 'no_sources', 0);
      continue;
    }
    out[field.name] = nullField(modelReason ?? 'not_stated', pages.length);
  }

  return {
    fields: out,
    sourcesUsed: pages.map((p) => p.url),
    sourcesRejected: [...rejected],
  };
}
