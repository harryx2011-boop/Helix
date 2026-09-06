export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter';

export const AI_PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini', 'openrouter'];

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
};

/**
 * One fast/cheap model id per provider for the intent-resolution call — this
 * is a small structured-output task, not a chat feature, so there is no
 * model picker in v1. These ids drift as providers rename their fast tier;
 * check each provider's current lineup periodically rather than trusting
 * this file indefinitely.
 */
export const RESOLUTION_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
  gemini: 'gemini-2.5-flash',
  openrouter: 'openai/gpt-5-mini',
};
