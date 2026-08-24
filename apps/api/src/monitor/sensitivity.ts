/**
 * Sensitivity: what counts as a change.
 *
 * `any` compares the extracted text verbatim. `significant` first strips the
 * noise most pages carry on every load — relative timestamps, clock times,
 * dates, rotating tracking parameters — so a "3 minutes ago" ticking over does
 * not page anyone at 4am. These are heuristics, not judgement; a model-scored
 * relevance pass is deliberately not part of v1 (spec §7).
 */

export type Sensitivity = 'any' | 'significant';

const RELATIVE_TIME =
  /\b(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s+ago\b/gi;
const JUST_NOW = /\bjust now\b/gi;
const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;
const CLOCK_TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b/g;
const SLASH_DATE = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g;
const MONTH_DATE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?(?:\s+\d{4})?\b/gi;
const DAY_MONTH_DATE =
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s+\d{4})?\b/gi;
const TRACKING_QUERY = /([?&](?:utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|_ga|sessionid|sid)=[^&)\s]*)/gi;
const CACHE_BUSTER = /([?&](?:v|ver|t|ts|cb|_)=\d+)(?=[&)\s]|$)/gi;

export function normalizeForComparison(text: string, sensitivity: Sensitivity): string {
  if (sensitivity === 'any') return text;

  return text
    .replace(RELATIVE_TIME, ' ')
    .replace(JUST_NOW, ' ')
    .replace(ISO_TIMESTAMP, ' ')
    .replace(CLOCK_TIME, ' ')
    .replace(SLASH_DATE, ' ')
    .replace(MONTH_DATE, ' ')
    .replace(DAY_MONTH_DATE, ' ')
    .replace(TRACKING_QUERY, '')
    .replace(CACHE_BUSTER, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
