import type { DeployIntent, OnboardingEndpoint, LlmProvider, OnboardingRole, UseCase } from '@/lib/supabase/types';

/**
 * The five questions (WEBSITE.md §6.2), kept out of the wizard component so
 * Settings → Preferences renders the same options from the same source.
 * No logos: the LLM step names vendors as words, because a provider mark
 * would be the only third-party branding in the app.
 */

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export const ROLE_CHOICES: Choice<OnboardingRole>[] = [
  { value: 'engineer', label: 'Engineer', hint: 'Building software that calls the API' },
  { value: 'founder', label: 'Founder', hint: 'Evaluating it for a product' },
  { value: 'researcher', label: 'Researcher', hint: 'Gathering data for analysis' },
  { value: 'data_ml', label: 'Data / ML', hint: 'Feeding pipelines and models' },
  { value: 'other', label: 'Other', hint: 'Something else entirely' },
];

export const USE_CASE_CHOICES: Choice<UseCase>[] = [
  { value: 'agent_tools', label: 'Agent tools', hint: 'Give an agent the web as a tool' },
  { value: 'research_pipeline', label: 'Research pipeline', hint: 'Collect and structure sources' },
  { value: 'rag_search', label: 'RAG / search index', hint: 'Chunk and embed pages into a vector store' },
  { value: 'monitoring', label: 'Monitoring', hint: 'Watch pages and fire on change' },
  { value: 'enrichment', label: 'Lead / CRM enrichment', hint: 'Fill fields from public pages' },
  { value: 'internal_tooling', label: 'Internal tooling', hint: 'Scripts and dashboards for one team' },
];

export const LLM_PROVIDER_CHOICES: Choice<LlmProvider>[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'local', label: 'Local', hint: 'Ollama or vLLM' },
  { value: 'unsure', label: 'Not sure yet' },
];

export const DEPLOY_INTENT_CHOICES: Choice<DeployIntent>[] = [
  { value: 'hosted', label: 'Hosted', hint: 'Run it here, keys and all' },
  { value: 'self_host', label: 'Self-host', hint: 'Your own infrastructure' },
  { value: 'both', label: 'Both', hint: 'Hosted to try, self-host to ship' },
];

export interface EndpointChoice extends Choice<OnboardingEndpoint> {
  /** Unshipped endpoints render a `coming` pill and cannot be selected. */
  coming?: boolean;
}

export const ENDPOINT_CHOICES: EndpointChoice[] = [
  { value: 'scrape', label: 'Scrape', hint: 'One page to markdown or JSON' },
  { value: 'parse', label: 'Parse', hint: 'A PDF, doc or sheet to text' },
  { value: 'search', label: 'Search', hint: 'Query the web, get content back' },
  { value: 'crawl', label: 'Crawl', hint: 'Follow a site and store every page' },
  { value: 'interact', label: 'Interact', hint: 'Drive a real browser session' },
  { value: 'monitor', label: 'Monitor', hint: 'Re-check a page on a schedule' },
];

export const TOTAL_STEPS = 5;
