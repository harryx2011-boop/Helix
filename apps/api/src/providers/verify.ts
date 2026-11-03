import { checkUrl } from '../core/url-guard.js';
import { ollamaTagsUrl, openAiModelsUrl } from './models.js';
import { isLocalProvider, type LocalProvider, type Provider } from './repository.js';


export type KeyVerdict = 'valid' | 'invalid' | 'unverifiable';

export interface KeyCheck {
  verdict: KeyVerdict;
  message?: string;
}

const TIMEOUT_MS = 10_000;

function requestFor(provider: Provider, key: string): { url: string; headers: Record<string, string> } | undefined {
  switch (provider) {
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/models?limit=1',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      };
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/models',
        headers: { authorization: `Bearer ${key}` },
      };
    case 'gemini':
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
        headers: { 'x-goog-api-key': key },
      };
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/key',
        headers: { authorization: `Bearer ${key}` },
      };
    case 'ollama':
    case 'vllm':
    case 'openai-compatible':
      return undefined;
  }
}

export function classifyKeyResponse(status: number, body: string): KeyVerdict {
  if (status >= 200 && status < 300) return 'valid';
  if (status === 429) return 'valid';
  if (status === 401 || status === 403) return 'invalid';
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return 'invalid';
  return 'unverifiable';
}

export async function verifyProviderKey(provider: Provider, key: string): Promise<KeyCheck> {
  const request = requestFor(provider, key);
  if (!request) {
    return { verdict: 'unverifiable', message: `${provider} has no key to check.` };
  }

  let response: Response;
  try {
    response = await fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { verdict: 'unverifiable', message: `Could not reach ${provider} to check the key.` };
  }

  const body = response.ok ? '' : await response.text().catch(() => '');
  const verdict = classifyKeyResponse(response.status, body);

  if (verdict === 'valid') return { verdict };
  return {
    verdict,
    message:
      verdict === 'invalid'
        ? `${provider} rejected this key. Check for typos, or whether it was revoked.`
        : `${provider} answered HTTP ${response.status}, which does not say whether the key is valid.`,
  };
}

export async function verifyLocalProvider(provider: LocalProvider, baseUrl: string): Promise<KeyCheck> {
  const verdict = await checkUrl(baseUrl, { allowPrivate: true });
  if (!verdict.ok) {
    return { verdict: 'invalid', message: verdict.reason };
  }

  const url = provider === 'ollama' ? ollamaTagsUrl(baseUrl) : openAiModelsUrl(baseUrl);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });
  } catch {
    return { verdict: 'unverifiable', message: `Could not reach the runtime at ${baseUrl}.` };
  }

  if (response.status === 401 || response.status === 403) {
    return { verdict: 'invalid', message: 'The runtime rejected this credential.' };
  }
  if (!response.ok) {
    return {
      verdict: 'unverifiable',
      message: `The runtime answered HTTP ${response.status}, which does not say whether the connection is good.`,
    };
  }
  return { verdict: 'valid' };
}

export async function verifyProvider(
  provider: Provider,
  opts: { apiKey?: string | undefined; baseUrl?: string | undefined },
): Promise<KeyCheck> {
  if (isLocalProvider(provider)) {
    return opts.baseUrl
      ? verifyLocalProvider(provider, opts.baseUrl)
      : { verdict: 'unverifiable', message: 'No base URL to check.' };
  }
  return opts.apiKey
    ? verifyProviderKey(provider, opts.apiKey)
    : { verdict: 'unverifiable', message: 'No key to check.' };
}
