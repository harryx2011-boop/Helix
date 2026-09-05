import { ValidationError } from '@/lib/engine/options';
import type { FileKind } from '@/lib/jobs/types';
import { getProviderKey } from './keys';
import { RESOLUTION_MODEL, type AiProvider } from './models';
import { parseResolvedIntent, type ResolvedIntent } from './resolve';
import { RESOLVE_INTENT_SCHEMA } from './schema';

export type IntentContext = {
  fileKind: FileKind;
  fileExt: string;
  fileSizeBytes: number;
  durationSec?: number;
};

export type ResolveResult = { ok: true; intent: ResolvedIntent } | { ok: false; message: string };

const TIMEOUT_MS = 8000;

function systemPrompt(ctx: IntentContext): string {
  const duration = ctx.durationSec !== undefined ? Math.round(ctx.durationSec) + 's' : 'unknown';
  return [
    'You resolve a user request into one call to resolve_conversion_intent.',
    'Never invent a format or option name outside the tool schema. If the request is ambiguous, pick the most',
    'common-sense interpretation rather than asking a follow-up question.',
    'Source file: kind=' + ctx.fileKind + ' ext=' + ctx.fileExt + ' size=' + ctx.fileSizeBytes + ' duration=' + duration + '.',
  ].join(' ');
}

async function callAnthropic(apiKey: string, prompt: string, ctx: IntentContext, signal: AbortSignal): Promise<unknown> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: RESOLUTION_MODEL.anthropic,
      max_tokens: 1024,
      system: systemPrompt(ctx),
      messages: [{ role: 'user', content: prompt }],
      tools: [{ name: RESOLVE_INTENT_SCHEMA.name, description: RESOLVE_INTENT_SCHEMA.description, input_schema: RESOLVE_INTENT_SCHEMA.parameters }],
      tool_choice: { type: 'tool', name: RESOLVE_INTENT_SCHEMA.name },
    }),
    signal,
  });
  if (!res.ok) throw new Error('Anthropic returned ' + res.status + '.');
  const body = await res.json();
  const block = (body.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  if (!block) throw new Error('Anthropic did not return a tool call.');
  return block.input;
}

async function callOpenAiCompatible(baseUrl: string, model: string, apiKey: string, prompt: string, ctx: IntentContext, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt(ctx) },
        { role: 'user', content: prompt },
      ],
      tools: [{ type: 'function', function: { name: RESOLVE_INTENT_SCHEMA.name, description: RESOLVE_INTENT_SCHEMA.description, parameters: RESOLVE_INTENT_SCHEMA.parameters } }],
      tool_choice: { type: 'function', function: { name: RESOLVE_INTENT_SCHEMA.name } },
    }),
    signal,
  });
  if (!res.ok) throw new Error(baseUrl + ' returned ' + res.status + '.');
  const body = await res.json();
  const call = body.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('The model did not return a tool call.');
  return JSON.parse(call.function.arguments);
}

async function callGemini(apiKey: string, prompt: string, ctx: IntentContext, signal: AbortSignal): Promise<unknown> {
  const model = RESOLUTION_MODEL.gemini;
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ functionDeclarations: [{ name: RESOLVE_INTENT_SCHEMA.name, description: RESOLVE_INTENT_SCHEMA.description, parameters: RESOLVE_INTENT_SCHEMA.parameters }] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [RESOLVE_INTENT_SCHEMA.name] } },
    }),
    signal,
  });
  if (!res.ok) throw new Error('Gemini returned ' + res.status + '.');
  const body = await res.json();
  const call = body.candidates?.[0]?.content?.parts?.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall;
  if (!call) throw new Error('Gemini did not return a function call.');
  return call.args;
}

async function callProvider(provider: AiProvider, apiKey: string, prompt: string, ctx: IntentContext, signal: AbortSignal): Promise<unknown> {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(apiKey, prompt, ctx, signal);
    case 'openai':
      return callOpenAiCompatible('https://api.openai.com/v1', RESOLUTION_MODEL.openai, apiKey, prompt, ctx, signal);
    case 'openrouter':
      return callOpenAiCompatible('https://openrouter.ai/api/v1', RESOLUTION_MODEL.openrouter, apiKey, prompt, ctx, signal);
    case 'gemini':
      return callGemini(apiKey, prompt, ctx, signal);
  }
}

export async function resolveIntent(provider: AiProvider, prompt: string, ctx: IntentContext): Promise<ResolveResult> {
  const apiKey = getProviderKey(provider);
  if (!apiKey) {
    return { ok: false, message: 'Add a provider key in Settings to use Ask AI.' };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let raw: unknown;
  try {
    raw = await callProvider(provider, apiKey, prompt, ctx, controller.signal);
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    return { ok: false, message: timedOut ? 'Timed out waiting for a response. Try the format picker below.' : 'Could not reach the model. Try the format picker below.' };
  } finally {
    window.clearTimeout(timeout);
  }

  try {
    const intent = parseResolvedIntent(raw);
    return { ok: true, intent };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { ok: false, message: 'That request was invalid (' + err.message + '). Try the format picker below.' };
    }
    return { ok: false, message: 'Could not understand that request. Try the format picker below.' };
  }
}

const KIND_WORD: Record<string, string> = { convert: 'Convert to', compress: 'Compress to', gif: 'Convert to', image: 'Convert to' };

export function describeIntent(intent: ResolvedIntent): string {
  const parts: string[] = [];
  if (intent.op === 'gif') {
    parts.push('Convert to GIF', intent.width + 'px wide', intent.fps + 'fps');
  } else {
    const to = intent.to ? intent.to.toUpperCase() : undefined;
    parts.push(to ? (KIND_WORD[intent.op] + ' ' + to) : (KIND_WORD[intent.op] ?? 'Convert'));
  }
  if (intent.op === 'compress') {
    if (intent.preset) parts.push(intent.preset + ' preset');
    if (intent.target) parts.push('under ' + formatMB(intent.target));
  }
  if (intent.op === 'image') {
    if (intent.quality !== undefined) parts.push('quality ' + intent.quality);
    if (intent.resize) parts.push(intent.resize.width + 'x' + intent.resize.height);
  }
  if ('options' in intent) {
    const o = intent.options as Record<string, unknown>;
    if (typeof o.crf === 'number') parts.push('crf ' + o.crf);
    if (typeof o.width === 'number' && intent.op !== 'gif') parts.push(o.width + 'px wide');
    if (typeof o.fps === 'number' && intent.op !== 'gif') parts.push(o.fps + 'fps');
    if (typeof o.targetBytes === 'number') parts.push('under ' + formatMB(o.targetBytes));
  }
  return 'Resolved: ' + parts.join(', ') + '.';
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(mb < 10 ? 1 : 0) + 'MB';
}
