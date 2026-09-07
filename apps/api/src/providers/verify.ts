import { checkUrl } from '../core/url-guard.js';
import { isLocalProvider, type Provider } from './repository.js';

/**
 * Does the provider accept this credential?
 *
 * A stored key used to be "configured", never "correct". `getProviderStatuses`
 * reports `configured: true` on row existence alone and the dashboard paints
 * "Connected · key ending in ab12" in green, so a mistyped or revoked key
 * looked healthy indefinitely and the first sign of trouble was a failed
 * extraction — by which point the caller has no reason to suspect the key.
 *
 * Each check here sends ONE cheap authenticated GET (the provider's model-list
 * endpoint) carrying exactly the credential under test, and classifies the
 * answer three ways:
 *
 *   valid         the provider accepted the credential (2xx — or 429, which is
 *                 an authenticated answer: a rate-limited key is a real key)
 *   invalid       the provider rejected the credential itself (401/403, plus
 *                 Gemini's 400 API_KEY_INVALID shape)
 *   unverifiable  the answer proves nothing about the credential — DNS, TLS,
 *                 socket, timeout, 5xx
 *
 * The three-way split is the point. `invalid` must mean the PROVIDER said no,
 * never that this instance's egress was down: the route refuses to store an
 * invalid key, so collapsing `unverifiable` into `invalid` would reject good
 * keys during a transient outage, and collapsing it into `valid` would put
 * back the green-dot lie this module exists to remove.
 *
 * Model-list GET rather than a generation call: free, fast, needs no model id,
 * and exercises exactly the thing being asked about — the credential.
 *
 * The plaintext goes into a request header and nowhere else. It is never
 * logged, never included in a returned message, and never echoed in an error.
 */

export type KeyVerdict = 'valid' | 'invalid' | 'unverifiable';

export interface KeyCheck {
  verdict: KeyVerdict;
  /** Human-readable detail for the caller. Never contains the credential. */
  message?: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Where each cloud provider answers "is this credential good", and how it wants
 * to be asked.
 *
 * OpenRouter is `/key`, NOT `/models`. Its catalogue is public and answers 200
 * to an absent or garbage token, so checking `/models` there would pass every
 * invalid key and report a working provider that fails on the first real call.
 * `/key` is the endpoint that actually reads the token.
 */
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
    /* Local runtimes are reached by base URL, not credential, and are verified
       by `verifyLocalProvider` below. Listed so the switch stays exhaustive and
       a provider cannot be added without deciding what its check is. */
    case 'ollama':
    case 'vllm':
    case 'openai-compatible':
      return undefined;
  }
}

/**
 * Pure classification, exported so a test can drive it without a network.
 *
 * Gemini rejects a bad key with 400 rather than 401, distinguishable from an
 * ordinary bad request only by the body's API_KEY_INVALID reason.
 */
export function classifyKeyResponse(status: number, body: string): KeyVerdict {
  if (status >= 200 && status < 300) return 'valid';
  if (status === 429) return 'valid';
  if (status === 401 || status === 403) return 'invalid';
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) return 'invalid';
  return 'unverifiable';
}

/** Verifies a cloud provider's API key by asking the provider. */
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
    /* The thrown detail is deliberately not forwarded. Fetch errors do not
       carry the key, but "nothing from this path reaches the caller" needs no
       case analysis to stay true. */
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

/**
 * Verifies a local runtime by reaching its base URL, which is the whole
 * credential there — most need no key at all. Private addresses are allowed
 * for the same reason `listLocalProviderModels` allows them: a local runtime is
 * loopback or LAN by design.
 *
 * A local runtime that is merely switched off is `unverifiable`, not `invalid`.
 * The URL may be perfectly correct and the caller may simply not have started
 * Ollama yet, and refusing to save it would strand them.
 */
export async function verifyLocalProvider(baseUrl: string): Promise<KeyCheck> {
  const verdict = await checkUrl(baseUrl, { allowPrivate: true });
  if (!verdict.ok) {
    return { verdict: 'invalid', message: verdict.reason };
  }

  const trimmed = baseUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${trimmed}/models`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
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

/** Verifies whichever credential this provider actually uses. */
export async function verifyProvider(
  provider: Provider,
  opts: { apiKey?: string | undefined; baseUrl?: string | undefined },
): Promise<KeyCheck> {
  if (isLocalProvider(provider)) {
    return opts.baseUrl
      ? verifyLocalProvider(opts.baseUrl)
      : { verdict: 'unverifiable', message: 'No base URL to check.' };
  }
  return opts.apiKey
    ? verifyProviderKey(provider, opts.apiKey)
    : { verdict: 'unverifiable', message: 'No key to check.' };
}
