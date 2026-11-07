import type { Page } from 'playwright';
import { z } from 'zod';
import { captureScreenshot } from './screenshot.js';


const MAX_TOTAL_WAIT_MS = 60_000;

export interface RunActionsOptions {
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
