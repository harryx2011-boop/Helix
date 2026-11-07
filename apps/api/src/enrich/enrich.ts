import { bandFor, type Confidence } from './confidence.js';
import { verifyGrounding, valueAppearsInCitation, type GroundingRejection } from './grounding.js';
import { runMetadataPhase, type ExtractorPhase, type FieldSpec, type PageEvidence } from './routing.js';
import type { SourceRejection } from './guards.js';


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
  quote: string;
  locator: string;
}

export interface EnrichedField {
  value: string | number | boolean | null;
  confidence: Confidence | null;
  citation: Citation | null;
  phase: ExtractorPhase | null;
  reason: NullReason | null;
  evidence: {
    valueInCitation: boolean;
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

function reasonFor(rejection: GroundingRejection): NullReason {
  return rejection;
}

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

interface ModelClaim {
  value?: unknown;
  sourceUrl?: unknown;
  citation?: unknown;
}

function asClaim(raw: unknown): ModelClaim | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as ModelClaim;
  return undefined;
}

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
  sourcesUsed: string[];
  sourcesRejected: RejectedSource[];
}

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
