import type { ModelInfo, ListModelsResult } from './models.js';
import { isLocalProvider, type Provider } from './repository.js';


export type CloudProvider = Exclude<Provider, 'ollama' | 'vllm' | 'openai-compatible'>;

export function isCloudProvider(provider: Provider): provider is CloudProvider {
  return !isLocalProvider(provider);
}

export const CURATED_MODELS: Record<CloudProvider, ModelInfo[]> = {
  anthropic: [
    { name: 'claude-opus-4-5' },
    { name: 'claude-sonnet-4-5' },
    { name: 'claude-haiku-4-5' },
  ],
  openai: [
    { name: 'gpt-5.1' },
    { name: 'gpt-5' },
    { name: 'gpt-4.1' },
    { name: 'gpt-4.1-mini' },
  ],
  gemini: [
    { name: 'gemini-2.5-pro' },
    { name: 'gemini-2.5-flash' },
  ],
  openrouter: [
    { name: 'anthropic/claude-sonnet-4.5' },
    { name: 'openai/gpt-5.1' },
    { name: 'google/gemini-2.5-pro' },
  ],
};

const FETCH_TIMEOUT_MS = 10_000;

function requestFor(provider: CloudProvider, key: string): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/models?limit=1000',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      };
    case 'openai':
      return { url: 'https://api.openai.com/v1/models', headers: { authorization: `Bearer ${key}` } };
    case 'gemini':
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
        headers: { 'x-goog-api-key': key },
      };
    case 'openrouter':
      return { url: 'https://openrouter.ai/api/v1/models', headers: { authorization: `Bearer ${key}` } };
  }
}

interface AnthropicList { data?: Array<{ id?: string; display_name?: string }> }
interface OpenAiList { data?: Array<{ id?: string }> }
interface GeminiList { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> }
interface OpenRouterList { data?: Array<{ id?: string; name?: string; context_length?: number }> }

function parseGemini(body: GeminiList): ModelInfo[] {
  return (body.models ?? [])
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => {
      const raw = m.name;
      if (!raw) return undefined;
      return { name: raw.startsWith('models/') ? raw.slice('models/'.length) : raw };
    })
    .filter((m): m is ModelInfo => m !== undefined);
}

function parseCatalogue(provider: CloudProvider, body: unknown): ModelInfo[] {
  switch (provider) {
    case 'anthropic':
      return ((body as AnthropicList).data ?? [])
        .map((m) => (m.id ? { name: m.id } : undefined))
        .filter((m): m is ModelInfo => m !== undefined);
    case 'openai':
      return ((body as OpenAiList).data ?? [])
        .map((m) => (m.id ? { name: m.id } : undefined))
        .filter((m): m is ModelInfo => m !== undefined);
    case 'gemini':
      return parseGemini(body as GeminiList);
    case 'openrouter':
      return ((body as OpenRouterList).data ?? [])
        .map((m) => (m.id ? { name: m.id } : undefined))
        .filter((m): m is ModelInfo => m !== undefined);
  }
}

export function mergeModels(curated: ModelInfo[], live: ModelInfo[]): ModelInfo[] {
  const seen = new Set(curated.map((m) => m.name));
  return [...curated, ...live.filter((m) => !seen.has(m.name))];
}

export async function listCloudModels(provider: CloudProvider, key: string | null): Promise<ListModelsResult> {
  const curated = CURATED_MODELS[provider];
  if (!key) return { ok: true, models: curated };

  const request = requestFor(provider, key);
  let response: Response;
  try {
    response = await fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return { ok: true, models: curated };
  }

  if (!response.ok) return { ok: true, models: curated };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: true, models: curated };
  }

  try {
    return { ok: true, models: mergeModels(curated, parseCatalogue(provider, body)) };
  } catch {
    return { ok: true, models: curated };
  }
}
