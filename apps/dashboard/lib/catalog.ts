import type { LucideIcon } from 'lucide-react';
import { Eye, FileScan, FileText, Map as MapIcon, MousePointerClick, Network, Search } from 'lucide-react';
import type { Endpoint } from './supabase/types';

/**
 * The single source of truth for the endpoint catalog across marketing, onboarding,
 * the app sidebar, the playground and SKILL.md generation (WEBSITE.md §11).
 *
 * `status` is flipped to 'live' by the endpoint's workflow, never by hand.
 */
export type EndpointStatus = 'live' | 'coming';
export type TabGroup = 'DISCOVER' | 'EXTRACT' | 'CRAWL' | 'ACT' | 'WATCH';

export interface EndpointDef {
  id: Endpoint;
  /** Proper-noun product name: "Scrape", never "scrape". */
  name: string;
  /** Footer / capability-page product name. */
  productName: string;
  /** Sidebar label (verb phrase). */
  sidebarLabel: string;
  /** One line, used on cards, onboarding rows and the overview. */
  tagline: string;
  method: 'POST' | 'GET';
  path: string;
  route: string;
  group: TabGroup;
  status: EndpointStatus;
  icon: LucideIcon;
  /** Whether it appears as a standalone product (Map is a capability inside Search/Crawl). */
  product: boolean;
  async: boolean;
}

export const ENDPOINTS: readonly EndpointDef[] = [
  { id: 'scrape', name: 'Scrape', productName: 'Web Scraping API', sidebarLabel: 'Scrape a web page', tagline: 'One URL in, clean markdown, JSON or a screenshot out. Documents return the same envelope as pages.', method: 'POST', path: '/v1/scrape', route: '/scrape', group: 'EXTRACT', status: 'live', icon: FileText, product: true, async: false },
  { id: 'parse', name: 'Parse', productName: 'Document Parsing API', sidebarLabel: 'Parse a file', tagline: 'PDF, DOCX, PPTX and XLSX by upload or URL. OCR only when the text layer is missing.', method: 'POST', path: '/v1/parse', route: '/parse', group: 'EXTRACT', status: 'live', icon: FileScan, product: true, async: false },
  { id: 'search', name: 'Search', productName: 'Web Search API', sidebarLabel: 'Search the web', tagline: 'Search the web and read every result in the same call. Bring your own search backend.', method: 'POST', path: '/v1/search', route: '/search', group: 'DISCOVER', status: 'live', icon: Search, product: true, async: false },
  { id: 'map', name: 'Map', productName: 'Site Map', sidebarLabel: 'Map a site', tagline: "List a site's URLs without reading them.", method: 'POST', path: '/v1/map', route: '/crawl', group: 'DISCOVER', status: 'live', icon: MapIcon, product: false, async: false },
  { id: 'crawl', name: 'Crawl', productName: 'Web Crawling API', sidebarLabel: 'Crawl entire website', tagline: 'Discover and read a whole site. Robots-aware, adaptive politeness, and an estimate before it runs.', method: 'POST', path: '/v1/crawl', route: '/crawl', group: 'CRAWL', status: 'live', icon: Network, product: true, async: true },
  { id: 'interact', name: 'Interact', productName: 'Browser Interaction', sidebarLabel: 'Interact with a page', tagline: 'A stateful browser session your agent can drive: click, type, scroll, extract.', method: 'POST', path: '/v1/interact', route: '/interact', group: 'ACT', status: 'coming', icon: MousePointerClick, product: true, async: false },
  { id: 'monitor', name: 'Monitor', productName: 'Web Monitoring', sidebarLabel: 'Monitor the web', tagline: 'Re-read on a schedule, get a diff when something changes. Unchanged pages cost nothing.', method: 'POST', path: '/v1/monitor', route: '/monitor', group: 'WATCH', status: 'coming', icon: Eye, product: true, async: true },
] as const;

export const TAB_GROUPS: readonly TabGroup[] = ['DISCOVER', 'EXTRACT', 'CRAWL', 'ACT', 'WATCH'];

export const PRODUCTS = ENDPOINTS.filter((e) => e.product);

export function endpointById(id: string): EndpointDef | undefined {
  return ENDPOINTS.find((e) => e.id === id);
}

/** Selected endpoints first (in selection order), then the rest in catalog order. */
export function orderBySelection(selected: readonly string[]): EndpointDef[] {
  const chosen = selected.map((id) => endpointById(id)).filter((e): e is EndpointDef => Boolean(e));
  const rest = ENDPOINTS.filter((e) => !selected.includes(e.id));
  return [...chosen, ...rest];
}

/** Example request bodies used by the hero curl builder, playground and SKILL.md. */
export const EXAMPLE_REQUEST: Record<Endpoint, Record<string, unknown>> = {
  scrape: { url: 'https://example.com', formats: ['markdown'] },
  parse: { url: 'https://example.com/files/report.pdf', formats: ['markdown'], ocr: 'auto' },
  search: { query: 'transactional email APIs', limit: 5, scrapeOptions: { formats: ['markdown'] } },
  map: { url: 'https://example.com' },
  crawl: { url: 'https://example.com', limit: 100, maxDepth: 3, estimate: true },
  interact: { url: 'https://example.com', actions: [{ type: 'click', selector: '#accept' }, { type: 'screenshot' }] },
  monitor: { url: 'https://example.com/pricing', schedule: '0 * * * *', sensitivity: 'significant', webhook: 'https://your.app/webhooks/helix' },
};
