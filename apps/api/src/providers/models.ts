import { checkUrl } from '../core/url-guard.js';
import { isLocalProvider, type LocalProvider } from './repository.js';

/**
 * Lists the models a local runtime (Ollama, vLLM, OpenAI-compatible) actually
 * has installed, so a caller can pick one instead of typing it blind.
 *
 * The base URL fetched here is always the caller's own, stored against their
 * own Helix API key — the same value `PUT /providers/:provider` already
 * accepts with no URL-safety gate, because it names their own runtime rather
 * than a third party's. `checkUrl` still runs, for scheme and shape, but with
 * private addresses allowed: a local runtime is loopback or LAN by design,
 * and refusing that would break the one thing this endpoint exists for.
 */

export interface ModelInfo {
  name: string;
  parameterSize?: string | undefined;
  quantization?: string | undefined;
  sizeBytes?: number | undefined;
  capabilities?: string[] | undefined;
}

export type ListModelsResult =
  | { ok: true; models: ModelInfo[] }
  | { ok: false; reason: 'invalid_base_url' | 'unreachable' | 'unsupported' | 'bad_response'; message: string };

const FETCH_TIMEOUT_MS = 5_000;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Ollama's native API lives at the origin; the stored `baseUrl` may carry an OpenAI-compatible `/v1` suffix or not. */
export function ollamaTagsUrl(baseUrl: string): string {
  const trimmed = stripTrailingSlash(baseUrl);
  const root = trimmed.endsWith('/v1') ? trimmed.slice(0, -'/v1'.length) : trimmed;
  return `${root}/api/tags`;
}

/** vLLM and generic OpenAI-compatible servers expose the OpenAI `GET /v1/models` shape at whatever base URL was stored. */
export function openAiModelsUrl(baseUrl: string): string {
  return `${stripTrailingSlash(baseUrl)}/models`;
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    size?: number;
    details?: { parameter_size?: string; quantization_level?: string };
    capabilities?: string[];
  }>;
}

interface OpenAiModelsResponse {
  data?: Array<{ id?: string }>;
}

function parseOllamaTags(body: OllamaTagsResponse): ModelInfo[] {
  return (body.models ?? [])
    .map((m) => {
      const name = m.name ?? m.model;
      if (!name) return undefined;
      const info: ModelInfo = { name };
      if (m.details?.parameter_size) info.parameterSize = m.details.parameter_size;
      if (m.details?.quantization_level) info.quantization = m.details.quantization_level;
      if (m.size !== undefined) info.sizeBytes = m.size;
      if (m.capabilities) info.capabilities = m.capabilities;
      return info;
    })
    .filter((m): m is ModelInfo => m !== undefined);
}

function parseOpenAiModels(body: OpenAiModelsResponse): ModelInfo[] {
  return (body.data ?? [])
    .map((m) => (m.id ? { name: m.id } : undefined))
    .filter((m): m is ModelInfo => m !== undefined);
}

export async function listLocalProviderModels(provider: LocalProvider, baseUrl: string): Promise<ListModelsResult> {
  if (!isLocalProvider(provider)) {
    return { ok: false, reason: 'unsupported', message: `${provider} has no installed-model listing.` };
  }

  const verdict = await checkUrl(baseUrl, { allowPrivate: true });
  if (!verdict.ok) {
    return { ok: false, reason: 'invalid_base_url', message: verdict.reason };
  }

  const url = provider === 'ollama' ? ollamaTagsUrl(baseUrl) : openAiModelsUrl(baseUrl);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return { ok: false, reason: 'unreachable', message: `Could not reach ${provider} at ${baseUrl}.` };
  }

  if (!response.ok) {
    return { ok: false, reason: 'unreachable', message: `${provider} responded with status ${response.status}.` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'bad_response', message: `${provider} did not return valid JSON.` };
  }

  try {
    const models = provider === 'ollama' ? parseOllamaTags(body as OllamaTagsResponse) : parseOpenAiModels(body as OpenAiModelsResponse);
    return { ok: true, models };
  } catch {
    return { ok: false, reason: 'bad_response', message: `${provider} returned an unexpected shape.` };
  }
}
