import type { Page } from 'playwright';
import { z } from 'zod';
import { classifyTransportError, detectBlock, type FailureReason } from '../core/block-detection.js';
import { UnsafeUrlError, assertPublicUrl, type Lookup } from '../core/url-guard.js';
import type { ExtractClient } from '../extract/client.js';
import type { Log } from '../core/logger.js';


const MAX_TOTAL_WAIT_MS = 60_000;
const ACTION_TIMEOUT_MS = 10_000;
const NAVIGATE_TIMEOUT_MS = 30_000;
const MAX_JS_RETURN_CHARS = 1_000_000;

export const InteractActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().url() }),
  z.object({ type: z.literal('click'), selector: z.string().min(1) }),
  z.object({ type: z.literal('type'), selector: z.string().min(1), text: z.string() }),
  z.object({ type: z.literal('press'), key: z.string().min(1) }),
  z.object({
    type: z.literal('scroll'),
    direction: z.enum(['up', 'down']).default('down'),
    amount: z.number().int().min(1).max(20_000).optional(),
  }),
  z.object({
    type: z.literal('wait'),
    milliseconds: z.number().int().min(0).max(30_000).optional(),
    selector: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal('screenshot'), fullPage: z.boolean().default(false) }),
  z.object({ type: z.literal('executeJavascript'), script: z.string().min(1) }),
  z.object({
    type: z.literal('extract'),
    prompt: z.string().min(1).max(4_000),
    schema: z.record(z.unknown()).optional(),
    model: z.string().optional(),
  }),
]);

export type InteractAction = z.infer<typeof InteractActionSchema>;

export interface InteractOutcome {
  output?: string | undefined;
  data?: Record<string, unknown> | undefined;
  screenshot?: string | undefined;
  javascriptReturns: unknown[];
  actionsRun: number;
  usage: { tokensInput: number; tokensOutput: number; model?: string | undefined };
}

export interface InteractActionDeps {
  extractClient: ExtractClient;
  logger?: Log | undefined;
  lookup?: Lookup | undefined;
}

export class ActionError extends Error {
  readonly index: number;
  readonly actionType: InteractAction['type'];
  readonly reason: FailureReason;
  readonly statusCode: number | undefined;
  readonly detectedBy: string[];
  readonly pageUnresponsive: boolean;

  constructor(input: {
    index: number;
    action: InteractAction;
    reason: FailureReason;
    message: string;
    statusCode?: number | undefined;
    detectedBy?: string[] | undefined;
    pageUnresponsive?: boolean | undefined;
  }) {
    super(`actions[${input.index}] (${input.action.type}): ${input.message}`);
    this.name = 'ActionError';
    this.index = input.index;
    this.actionType = input.action.type;
    this.reason = input.reason;
    this.statusCode = input.statusCode;
    this.detectedBy = input.detectedBy ?? [];
    this.pageUnresponsive = input.pageUnresponsive ?? false;
  }
}

class EvaluateTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timeout ${ms}ms exceeded. The page did not return from the script.`);
    this.name = 'EvaluateTimeoutError';
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EvaluateTimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function guardPage(page: Page, lookup?: Lookup): Promise<void> {
  const verdicts = new Map<string, Promise<boolean>>();
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    if (!/^https?:/i.test(url)) return route.continue();
    const host = new URL(url).host;
    let verdict = verdicts.get(host);
    if (!verdict) {
      verdict = assertPublicUrl(url, lookup).then(
        () => true,
        () => false,
      );
      verdicts.set(host, verdict);
    }
    return (await verdict) ? route.continue() : route.abort('blockedbyclient');
  });
}

export interface InvalidActionError extends Error {
  statusCode: 400;
  field: string;
}

export function parseInteractActions(input: unknown[]): InteractAction[] {
  return input.map((action, index) => {
    const parsed = InteractActionSchema.safeParse(action);
    if (parsed.success) return parsed.data;

    const first = parsed.error.issues[0];
    const path = first && first.path.length > 0 ? `.${first.path.join('.')}` : '';
    const error: InvalidActionError = Object.assign(
      new Error(`actions[${index}]${path}: ${first?.message ?? 'invalid action'}`),
      { statusCode: 400 as const, field: `actions.${index}${path}` },
    );
    throw error;
  });
}

function answerSchema(prompt: string): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      answer: { type: 'string', description: prompt },
    },
    required: ['answer'],
  };
}

async function pageText(page: Page, deps: InteractActionDeps): Promise<string> {
  const html = await page.content();
  try {
    const extracted = await deps.extractClient.extract({ html, url: page.url(), onlyMainContent: true });
    if (extracted.markdown.trim().length > 0) return extracted.markdown;
  } catch (error) {
    deps.logger?.debug({ error }, 'boilerplate stripping unavailable, sending visible text');
  }
  const text = await page.evaluate(() => document.body?.innerText ?? '');
  return typeof text === 'string' ? text : '';
}

export async function runInteractActions(
  page: Page,
  actions: InteractAction[],
  deps: InteractActionDeps,
): Promise<InteractOutcome> {
  const outcome: InteractOutcome = {
    javascriptReturns: [],
    actionsRun: 0,
    usage: { tokensInput: 0, tokensOutput: 0 },
  };

  const wait = { total: 0 };

  for (const [index, action] of actions.entries()) {
    try {
      await runOne(page, action, index, outcome, deps, wait);
      outcome.actionsRun++;
    } catch (error) {
      if (error instanceof ActionError) throw error;
      const text = error instanceof Error ? error.message : String(error);
      throw new ActionError({ index, action, reason: classifyTransportError(text), message: text });
    }
  }

  return outcome;
}

async function runOne(
  page: Page,
  action: InteractAction,
  index: number,
  outcome: InteractOutcome,
  deps: InteractActionDeps,
  wait: { total: number },
): Promise<void> {
  switch (action.type) {
    case 'navigate': {
      try {
        await assertPublicUrl(action.url, deps.lookup);
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          throw new ActionError({ index, action, reason: 'unsafe_url', message: `${action.url}: ${error.message}` });
        }
        throw error;
      }
      const response = await page.goto(action.url, {
        timeout: NAVIGATE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      const statusCode = response?.status() ?? 0;
      const headers = response ? await response.allHeaders().catch(() => ({})) : {};
      const body = await page.content();
      const verdict = detectBlock({ statusCode, headers, body });
      if (verdict.blocked && verdict.reason) {
        throw new ActionError({
          index,
          action,
          reason: verdict.reason,
          message: `${action.url} answered with a ${verdict.reason} page`,
          statusCode,
          detectedBy: verdict.detectedBy,
        });
      }
      if (statusCode >= 400) {
        throw new ActionError({
          index,
          action,
          reason: 'http_error',
          message: `${action.url} returned HTTP ${statusCode}`,
          statusCode,
        });
      }
      return;
    }

    case 'click':
      await page.click(action.selector, { timeout: ACTION_TIMEOUT_MS });
      return;

    case 'type':
      await page.fill(action.selector, action.text, { timeout: ACTION_TIMEOUT_MS });
      return;

    case 'press':
      await page.keyboard.press(action.key);
      return;

    case 'scroll': {
      const sign = action.direction === 'up' ? -1 : 1;
      await withTimeout(
        page.evaluate(
          ([s, amount]) => window.scrollBy(0, s * (amount ?? window.innerHeight)),
          [sign, action.amount] as [number, number | undefined],
        ),
        ACTION_TIMEOUT_MS,
      );
      return;
    }

    case 'wait': {
      const remaining = Math.max(0, MAX_TOTAL_WAIT_MS - wait.total);
      if (action.selector) {
        if (remaining <= 0) {
          throw new ActionError({
            index,
            action,
            reason: 'timeout',
            message: `the ${MAX_TOTAL_WAIT_MS / 1000}s waiting budget for this request is spent`,
          });
        }
        const started = Date.now();
        await page.waitForSelector(action.selector, { timeout: Math.max(1, Math.min(remaining, 30_000)) });
        wait.total += Date.now() - started;
      } else {
        const ms = Math.min(action.milliseconds ?? 1_000, remaining);
        if (ms > 0) {
          await page.waitForTimeout(ms);
          wait.total += ms;
        }
      }
      return;
    }

    case 'screenshot': {
      const buffer = await page.screenshot({ fullPage: action.fullPage, type: 'png' });
      outcome.screenshot = `data:image/png;base64,${buffer.toString('base64')}`;
      return;
    }

    case 'executeJavascript': {
      try {
        const value = await withTimeout(
          (async () => {
            const handle = await page.evaluateHandle(action.script);
            try {
              const size = await handle.evaluate((v) => {
                try {
                  const json = JSON.stringify(v);
                  return json === undefined ? 0 : json.length;
                } catch {
                  return 0;
                }
              });
              if (size > MAX_JS_RETURN_CHARS) {
                throw new ActionError({
                  index,
                  action,
                  reason: 'http_error',
                  message: `return value is ${size} characters serialized; the limit is ${MAX_JS_RETURN_CHARS}`,
                });
              }
              return (await handle.jsonValue()) as unknown;
            } finally {
              await handle.dispose().catch(() => undefined);
            }
          })(),
          ACTION_TIMEOUT_MS,
        );
        outcome.javascriptReturns.push(value);
      } catch (error) {
        if (error instanceof EvaluateTimeoutError) {
          throw new ActionError({ index, action, reason: 'timeout', message: error.message, pageUnresponsive: true });
        }
        throw error;
      }
      return;
    }

    case 'extract': {
      const content = await pageText(page, deps);
      const schema = action.schema ?? answerSchema(action.prompt);
      const result = await deps.extractClient.structured({
        content,
        schema,
        prompt: action.prompt,
        model: action.model,
      });
      outcome.usage.tokensInput += result.tokensInput;
      outcome.usage.tokensOutput += result.tokensOutput;
      outcome.usage.model = result.modelUsed;
      outcome.data = result.data;
      if (action.schema) {
        outcome.output = JSON.stringify(result.data);
      } else {
        const answer = result.data['answer'];
        outcome.output = typeof answer === 'string' ? answer : JSON.stringify(result.data);
      }
      return;
    }
  }
}
