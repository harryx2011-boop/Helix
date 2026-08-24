import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import type { ExtractClient } from '../extract/client.js';
import { ActionError, parseInteractActions, runInteractActions } from './interact-actions.js';

const ARTICLE = `<html><body><article>${'Real article text about a real topic. '.repeat(40)}</article></body></html>`;

const CLOUDFLARE_CHALLENGE = `<html><head><title>Just a moment...</title></head>
<body><div class="cf-browser-verification">Checking your browser before accessing</div></body></html>`;

interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  content: ReturnType<typeof vi.fn>;
  url: () => string;
  click: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  keyboard: { press: ReturnType<typeof vi.fn>; type: ReturnType<typeof vi.fn> };
  evaluate: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  waitForSelector: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
}

function fakePage(overrides: Partial<FakePage> = {}): FakePage {
  return {
    goto: vi.fn(async () => ({ status: () => 200, allHeaders: async () => ({}) })),
    content: vi.fn(async () => ARTICLE),
    url: () => 'https://example.com/shop',
    click: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    keyboard: { press: vi.fn(async () => undefined), type: vi.fn(async () => undefined) },
    evaluate: vi.fn(async () => 'from-page'),
    waitForTimeout: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => Buffer.from('png-bytes')),
    ...overrides,
  };
}

function fakeExtract(overrides: Partial<{ extract: unknown; structured: unknown }> = {}) {
  return {
    extract: vi.fn(async () => ({
      markdown: '# Shop\n\nKeyboard $49.99',
      text: 'Keyboard $49.99',
      links: [],
      extractorUsed: 'trafilatura',
      contentHash: 'abc',
    })),
    structured: vi.fn(async () => ({
      data: { answer: 'Keyboard available at $49.99' },
      tokensInput: 120,
      tokensOutput: 12,
      modelUsed: 'gpt-4o-mini',
      blocksKept: 1,
      blocksTotal: 1,
    })),
    ...overrides,
  } as unknown as ExtractClient & { extract: ReturnType<typeof vi.fn>; structured: ReturnType<typeof vi.fn> };
}

const asPage = (page: FakePage): Page => page as unknown as Page;

describe('parseInteractActions', () => {
  it('rejects an unknown action type and names the field', () => {
    expect(() => parseInteractActions([{ type: 'hover', selector: '#x' }])).toThrow(/actions\[0\]\.type/);
    try {
      parseInteractActions([{ type: 'click' }]);
    } catch (error) {
      expect((error as { field?: string }).field).toBe('actions.0.selector');
      expect((error as { statusCode?: number }).statusCode).toBe(400);
    }
  });

  it('accepts the spec union with defaults applied', () => {
    const actions = parseInteractActions([
      { type: 'navigate', url: 'https://example.com' },
      { type: 'scroll' },
      { type: 'screenshot' },
      { type: 'extract', prompt: 'price' },
    ]);
    expect(actions[1]).toEqual({ type: 'scroll', direction: 'down' });
    expect(actions[2]).toEqual({ type: 'screenshot', fullPage: false });
  });
});

describe('runInteractActions', () => {
  it('drives the page with the selector-based actions', async () => {
    const page = fakePage();
    const outcome = await runInteractActions(
      asPage(page),
      [
        { type: 'click', selector: '#accept' },
        { type: 'type', selector: '#search', text: 'keyboard' },
        { type: 'press', key: 'Enter' },
        { type: 'scroll', direction: 'up', amount: 300 },
        { type: 'wait', milliseconds: 250 },
        { type: 'wait', selector: '.results' },
      ],
      { extractClient: fakeExtract() },
    );

    expect(page.click).toHaveBeenCalledWith('#accept', { timeout: 10_000 });
    expect(page.fill).toHaveBeenCalledWith('#search', 'keyboard', { timeout: 10_000 });
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
    expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), [-1, 300]);
    expect(page.waitForTimeout).toHaveBeenCalledWith(250);
    expect(page.waitForSelector).toHaveBeenCalledWith('.results', { timeout: 30_000 });
    expect(outcome.actionsRun).toBe(6);
    expect(outcome.output).toBeUndefined();
  });

  it('caps total waiting so a chain of sleeps cannot hold the page', async () => {
    const page = fakePage();
    await runInteractActions(
      asPage(page),
      [
        { type: 'wait', milliseconds: 30_000 },
        { type: 'wait', milliseconds: 30_000 },
        { type: 'wait', milliseconds: 30_000 },
      ],
      { extractClient: fakeExtract() },
    );
    expect(page.waitForTimeout).toHaveBeenCalledTimes(2);
  });

  it('returns the screenshot as a data URL and JavaScript returns in order', async () => {
    const page = fakePage();
    const outcome = await runInteractActions(
      asPage(page),
      [
        { type: 'screenshot', fullPage: true },
        { type: 'executeJavascript', script: 'document.title' },
      ],
      { extractClient: fakeExtract() },
    );
    expect(page.screenshot).toHaveBeenCalledWith({ fullPage: true, type: 'png' });
    expect(outcome.screenshot).toBe(`data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`);
    expect(outcome.javascriptReturns).toEqual(['from-page']);
  });

  it('extract with a prompt sends stripped markdown and returns the answer as output', async () => {
    const page = fakePage();
    const extractClient = fakeExtract();
    const outcome = await runInteractActions(
      asPage(page),
      [{ type: 'extract', prompt: 'Get the price of the first result' }],
      { extractClient },
    );

    expect(extractClient.extract).toHaveBeenCalledWith(
      expect.objectContaining({ html: ARTICLE, url: 'https://example.com/shop', onlyMainContent: true }),
    );
    expect(extractClient.structured).toHaveBeenCalledWith({
      content: '# Shop\n\nKeyboard $49.99',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string', description: 'Get the price of the first result' } },
        required: ['answer'],
      },
      prompt: 'Get the price of the first result',
      model: undefined,
    });
    expect(outcome.output).toBe('Keyboard available at $49.99');
    expect(outcome.data).toEqual({ answer: 'Keyboard available at $49.99' });
    expect(outcome.usage).toEqual({ tokensInput: 120, tokensOutput: 12, model: 'gpt-4o-mini' });
  });

  it('extract with a schema returns the object and its JSON as output', async () => {
    const extractClient = fakeExtract({
      structured: vi.fn(async () => ({
        data: { price: 49.99 },
        tokensInput: 10,
        tokensOutput: 2,
        modelUsed: 'm',
        blocksKept: 1,
        blocksTotal: 1,
      })),
    });
    const schema = { type: 'object', properties: { price: { type: 'number' } } };
    const outcome = await runInteractActions(
      asPage(fakePage()),
      [{ type: 'extract', prompt: 'price', schema, model: 'gpt-4o' }],
      { extractClient },
    );
    expect(extractClient.structured).toHaveBeenCalledWith(expect.objectContaining({ schema, model: 'gpt-4o' }));
    expect(outcome.data).toEqual({ price: 49.99 });
    expect(outcome.output).toBe('{"price":49.99}');
  });

  it('falls back to visible text when boilerplate stripping is unavailable', async () => {
    const page = fakePage({ evaluate: vi.fn(async () => 'Visible text only') });
    const extractClient = fakeExtract({
      extract: vi.fn(async () => {
        throw new Error('helix-extract returned HTTP 503');
      }),
    });
    await runInteractActions(asPage(page), [{ type: 'extract', prompt: 'price' }], { extractClient });
    expect(extractClient.structured).toHaveBeenCalledWith(expect.objectContaining({ content: 'Visible text only' }));
  });

  it('reports an HTTP error on navigate with the action index', async () => {
    const page = fakePage({
      goto: vi.fn(async () => ({ status: () => 404, allHeaders: async () => ({}) })),
    });
    const run = runInteractActions(
      asPage(page),
      [{ type: 'click', selector: '#a' }, { type: 'navigate', url: 'https://example.com/missing' }],
      { extractClient: fakeExtract() },
    );
    await expect(run).rejects.toBeInstanceOf(ActionError);
    await run.catch((error: ActionError) => {
      expect(error.index).toBe(1);
      expect(error.actionType).toBe('navigate');
      expect(error.reason).toBe('http_error');
      expect(error.statusCode).toBe(404);
    });
  });

  it('never returns a bot challenge as a successful navigation', async () => {
    const page = fakePage({
      goto: vi.fn(async () => ({ status: () => 200, allHeaders: async () => ({ server: 'cloudflare' }) })),
      content: vi.fn(async () => CLOUDFLARE_CHALLENGE),
    });
    await runInteractActions(asPage(page), [{ type: 'navigate', url: 'https://example.com' }], {
      extractClient: fakeExtract(),
    }).catch((error: ActionError) => {
      expect(error.reason).toBe('challenge');
      expect(error.detectedBy.length).toBeGreaterThan(0);
    });
  });

  it('classifies a Playwright timeout as `timeout` and stops at the failing action', async () => {
    const page = fakePage({
      click: vi.fn(async () => {
        throw new Error('Timeout 10000ms exceeded. waiting for locator("#gone")');
      }),
    });
    const run = runInteractActions(
      asPage(page),
      [{ type: 'press', key: 'Tab' }, { type: 'click', selector: '#gone' }, { type: 'screenshot', fullPage: false }],
      { extractClient: fakeExtract() },
    );
    await run.catch((error: ActionError) => {
      expect(error.reason).toBe('timeout');
      expect(error.index).toBe(1);
      expect(error.actionType).toBe('click');
    });
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it('reports the model service being down as service_unavailable, never as a block', async () => {
    const extractClient = fakeExtract({
      structured: vi.fn(async () => {
        throw new Error('helix-extract returned HTTP 503: no provider configured');
      }),
    });
    await runInteractActions(asPage(fakePage()), [{ type: 'extract', prompt: 'price' }], { extractClient }).catch(
      (error: ActionError) => {
        expect(error.reason).toBe('service_unavailable');
      },
    );
  });
});
