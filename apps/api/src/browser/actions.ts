import type { Page } from 'playwright';
import { z } from 'zod';
import { captureScreenshot } from './screenshot.js';

/**
 * Pre-scrape browser actions.
 *
 * Scripted steps, deliberately not an agent: the caller says exactly what to do,
 * and the same input produces the same run. Agentic navigation is a separate
 * concern with different failure modes and different costs.
 *
 * Total wait across a request is capped, and every step is also bounded by the
 * request's own deadline, so a caller cannot hold a browser context open
 * beyond `timeout` with a chain of long sleeps or slow clicks.
 */

const MAX_TOTAL_WAIT_MS = 60_000;

export interface RunActionsOptions {
  /** Absolute time (ms since epoch) after which no step may still be running. */
  deadline?: number | undefined;
}

const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('wait'),
    milliseconds: z.number().int().min(0).max(30_000).optional(),
    selector: z.string().optional(),
  }),
  z.object({
    type: z.literal('click'),
    selector: z.string(),
    all: z.boolean().default(false),
  }),
  z.object({ type: z.literal('write'), text: z.string() }),
  z.object({ type: z.literal('press'), key: z.string() }),
  z.object({
    type: z.literal('scroll'),
    direction: z.enum(['up', 'down']).default('down'),
    selector: z.string().optional(),
  }),
  z.object({
    type: z.literal('screenshot'),
    fullPage: z.boolean().default(false),
  }),
  z.object({ type: z.literal('executeJavascript'), script: z.string() }),
  z.object({ type: z.literal('scrape') }),
]);

export type Action = z.infer<typeof ActionSchema>;

export interface ActionOutcome {
  screenshots: string[];
  scrapes: { url: string; html: string }[];
  javascriptReturns: unknown[];
}

export function parseActions(input: unknown[]): Action[] {
  return input.map((action, index) => {
    const parsed = ActionSchema.safeParse(action);
    if (!parsed.success) {
      throw new Error(
        `action[${index}] is invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    return parsed.data;
  });
}

export async function runActions(
  page: Page,
  input: unknown[],
  options: RunActionsOptions = {},
): Promise<ActionOutcome> {
  const actions = parseActions(input);
  const outcome: ActionOutcome = { screenshots: [], scrapes: [], javascriptReturns: [] };

  // Never 0: Playwright reads a zero timeout as "no timeout".
  const remaining = (): number =>
    options.deadline === undefined ? Number.POSITIVE_INFINITY : Math.max(1, options.deadline - Date.now());

  let waited = 0;

  for (const action of actions) {
    switch (action.type) {
      case 'wait': {
        if (action.selector) {
          const budget = Math.max(0, MAX_TOTAL_WAIT_MS - waited);
          const started = Date.now();
          await page.waitForSelector(action.selector, { timeout: Math.min(budget, 30_000, remaining()) });
          waited += Date.now() - started;
        } else {
          const ms = Math.min(action.milliseconds ?? 1_000, MAX_TOTAL_WAIT_MS - waited, remaining());
          if (ms > 0) {
            await page.waitForTimeout(ms);
            waited += ms;
          }
        }
        break;
      }

      case 'click': {
        if (action.all) {
          const elements = page.locator(action.selector);
          const count = await elements.count();
          for (let i = 0; i < count; i++) {
            await elements.nth(i).click({ timeout: Math.min(5_000, remaining()) }).catch(() => undefined);
          }
        } else {
          await page.click(action.selector, { timeout: Math.min(10_000, remaining()) });
        }
        break;
      }

      case 'write':
        // Types into whatever currently has focus, so a click must precede it.
        await page.keyboard.type(action.text);
        break;

      case 'press':
        await page.keyboard.press(action.key);
        break;

      case 'scroll': {
        const delta = action.direction === 'up' ? -1 : 1;
        if (action.selector) {
          await page.locator(action.selector).evaluate((el, d) => {
            el.scrollBy(0, d * el.clientHeight);
          }, delta);
        } else {
          await page.evaluate((d) => window.scrollBy(0, d * window.innerHeight), delta);
        }
        break;
      }

      case 'screenshot': {
        outcome.screenshots.push(await captureScreenshot(page, action.fullPage));
        break;
      }

      case 'executeJavascript': {
        // Runs in page context. Only reachable by an authenticated caller who
        // already controls what this instance fetches.
        const value: unknown = await page.evaluate(action.script);
        outcome.javascriptReturns.push(value);
        break;
      }

      case 'scrape': {
        outcome.scrapes.push({ url: page.url(), html: await page.content() });
        break;
      }
    }
  }

  return outcome;
}
