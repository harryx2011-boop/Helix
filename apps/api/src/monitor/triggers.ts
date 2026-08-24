import type { Diff } from './diff.js';

/**
 * Triggers narrow which changes fire a webhook. Keyword triggers need no model
 * call: "tell me when 'Out of stock' disappears" is a string search on two
 * snapshots, and that is enough for most watches.
 */

export interface TriggerOptions {
  keywordAppears?: string | undefined;
  keywordDisappears?: string | undefined;
  /** Watch only this part of the page. Shorthand for `scrapeOptions.includeSelectors`. */
  selector?: string | undefined;
  /** Ignore changes smaller than this fraction of the content (0–1). */
  minChangeRatio?: number | undefined;
}

export type TriggerReason =
  | 'changed'
  | 'keyword_appeared'
  | 'keyword_disappeared'
  | 'keyword_not_met'
  | 'below_min_change';

export interface TriggerVerdict {
  fire: boolean;
  reason: TriggerReason;
}

function includes(haystack: string | null, needle: string): boolean {
  return haystack !== null && haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Evaluate a change that has already passed the sensitivity filter. `before`
 * is null on the first check, when nothing can have appeared or disappeared.
 */
export function evaluateTrigger(
  trigger: TriggerOptions,
  input: { before: string | null; after: string; diff: Diff },
): TriggerVerdict {
  if (trigger.minChangeRatio !== undefined && input.diff.changeRatio < trigger.minChangeRatio) {
    return { fire: false, reason: 'below_min_change' };
  }

  const wantsAppear = trigger.keywordAppears !== undefined && trigger.keywordAppears.length > 0;
  const wantsDisappear = trigger.keywordDisappears !== undefined && trigger.keywordDisappears.length > 0;

  if (!wantsAppear && !wantsDisappear) {
    return { fire: true, reason: 'changed' };
  }

  if (wantsAppear) {
    const word = trigger.keywordAppears!;
    if (includes(input.after, word) && !includes(input.before, word)) {
      return { fire: true, reason: 'keyword_appeared' };
    }
  }

  if (wantsDisappear) {
    const word = trigger.keywordDisappears!;
    if (includes(input.before, word) && !includes(input.after, word)) {
      return { fire: true, reason: 'keyword_disappeared' };
    }
  }

  return { fire: false, reason: 'keyword_not_met' };
}
