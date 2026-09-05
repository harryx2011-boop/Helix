import type { LucideIcon } from 'lucide-react';
import { Braces, Camera, Eye, FileOutput, FileScan, FileText, Files, Map as MapIcon, MousePointerClick, Network, ScanEye, Search } from 'lucide-react';
import type { Endpoint, RunnableEndpoint } from './endpoints';

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
  /** Sidebar label: the one-word action. */
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
  /**
   * Whether the playground can call it. False while an endpoint has a marketing
   * page and a documented shape but no SDK method yet, so the tab is not offered
   * rather than offered and failing.
   */
  runnable: boolean;
}

export const ENDPOINTS: readonly EndpointDef[] = [
  { id: 'scrape', name: 'Scrape', productName: 'Web Scraping API', sidebarLabel: 'Scrape', tagline: 'One URL in, clean markdown, JSON or a screenshot out. Documents return the same envelope as pages.', method: 'POST', path: '/v1/scrape', route: '/scrape', group: 'EXTRACT', status: 'live', icon: FileText, product: true, async: false, runnable: true },
  { id: 'document', name: 'Document', productName: 'Document API', sidebarLabel: 'Document', tagline: 'PDF, DOCX, PPTX and XLSX in. Markdown, structured JSON, page images or a scrubbed copy out.', method: 'POST', path: '/v1/document', route: '/document', group: 'EXTRACT', status: 'live', icon: Files, product: true, async: false, runnable: false },
  { id: 'parse', name: 'Parse', productName: 'Document Parsing', sidebarLabel: 'Parse', tagline: 'PDF, DOCX, PPTX and XLSX by upload or URL. OCR only when the text layer is missing.', method: 'POST', path: '/v1/parse', route: '/document#parse', group: 'EXTRACT', status: 'live', icon: FileScan, product: false, async: false, runnable: true },
  { id: 'metadata', name: 'Metadata', productName: 'File Metadata', sidebarLabel: 'Metadata', tagline: 'What a file gives away about who and what made it \u2014 and a copy without it.', method: 'POST', path: '/v1/metadata', route: '/document#metadata', group: 'EXTRACT', status: 'live', icon: ScanEye, product: false, async: false, runnable: true },
  { id: 'convert', name: 'Convert', productName: 'Document Conversion', sidebarLabel: 'Convert', tagline: 'Rasterize a PDF page to an image, or turn an Office file into markdown.', method: 'POST', path: '/v1/convert', route: '/document#convert', group: 'EXTRACT', status: 'live', icon: FileOutput, product: false, async: false, runnable: true },
  { id: 'extract', name: 'Extract', productName: 'Structured Extraction API', sidebarLabel: 'Extract', tagline: 'Describe the shape you want. Get typed rows back, every field traced to where it came from.', method: 'POST', path: '/v1/extract', route: '/extract', group: 'EXTRACT', status: 'live', icon: Braces, product: true, async: false, runnable: false },
  { id: 'screenshot', name: 'Screenshot', productName: 'Screenshot API', sidebarLabel: 'Screenshot', tagline: 'Full page, viewport or one element. PNG, JPEG, WebP or PDF, at any device size.', method: 'POST', path: '/v1/screenshot', route: '/screenshot', group: 'EXTRACT', status: 'live', icon: Camera, product: true, async: false, runnable: false },
  { id: 'search', name: 'Search', productName: 'Web Search API', sidebarLabel: 'Search', tagline: 'Search the web and read every result in the same call. Bring your own search backend.', method: 'POST', path: '/v1/search', route: '/search', group: 'DISCOVER', status: 'live', icon: Search, product: true, async: false, runnable: true },
  { id: 'map', name: 'Map', productName: 'Site Map', sidebarLabel: 'Map', tagline: "List a site's URLs without reading them.", method: 'POST', path: '/v1/map', route: '/map', group: 'DISCOVER', status: 'live', icon: MapIcon, product: true, async: false, runnable: true },
  { id: 'crawl', name: 'Crawl', productName: 'Web Crawling API', sidebarLabel: 'Crawl', tagline: 'Discover and read a whole site. Robots-aware, adaptive politeness, and an estimate before it runs.', method: 'POST', path: '/v1/crawl', route: '/crawl', group: 'CRAWL', status: 'live', icon: Network, product: true, async: true, runnable: true },
  { id: 'interact', name: 'Interact', productName: 'Browser Interaction', sidebarLabel: 'Interact', tagline: 'A stateful browser session your agent can drive: click, type, scroll, extract.', method: 'POST', path: '/v1/interact', route: '/interact', group: 'ACT', status: 'live', icon: MousePointerClick, product: true, async: false, runnable: true },
  { id: 'monitor', name: 'Monitor', productName: 'Web Monitoring', sidebarLabel: 'Monitor', tagline: 'Re-read on a schedule, get a diff when something changes. Unchanged pages cost nothing.', method: 'POST', path: '/v1/monitor', route: '/monitor', group: 'WATCH', status: 'live', icon: Eye, product: true, async: true, runnable: true },
] as const;

export const TAB_GROUPS: readonly TabGroup[] = ['DISCOVER', 'EXTRACT', 'CRAWL', 'ACT', 'WATCH'];

export const PRODUCTS = ENDPOINTS.filter((e) => e.product);

/** An endpoint the SDK client can call, narrowed so callers index runnable-only maps. */
export type RunnableEndpointDef = EndpointDef & { id: RunnableEndpoint };

/** What the playground offers a tab for. See `EndpointDef.runnable`. */
export const RUNNABLE: readonly RunnableEndpointDef[] = ENDPOINTS.filter(
  (e): e is RunnableEndpointDef => e.runnable,
);

export function endpointById(id: string): EndpointDef | undefined {
  return ENDPOINTS.find((e) => e.id === id);
}

/** `endpointById` for surfaces that can only render something callable. */
export function runnableById(id: string): RunnableEndpointDef | undefined {
  return RUNNABLE.find((e) => e.id === id);
}

/**
 * Selected endpoints first (in selection order), then the rest in catalog order.
 * Runnable only: every caller renders a playground tab, and a tab the playground
 * does not offer is a dead link.
 */
export function orderBySelection(selected: readonly string[]): RunnableEndpointDef[] {
  const chosen = selected.map((id) => runnableById(id)).filter((e): e is RunnableEndpointDef => Boolean(e));
  const rest = RUNNABLE.filter((e) => !selected.includes(e.id));
  return [...chosen, ...rest];
}

/** Example request bodies used by the hero curl builder, playground and SKILL.md. */
export const EXAMPLE_REQUEST: Record<Endpoint, Record<string, unknown>> = {
  scrape: { url: 'https://example.com', formats: ['markdown'] },
  document: { op: 'parse', url: 'https://example.com/files/report.pdf', formats: ['markdown'], ocr: 'auto' },
  parse: { url: 'https://example.com/files/report.pdf', formats: ['markdown'], ocr: 'auto' },
  metadata: { url: 'https://example.com/files/report.pdf' },
  convert: { url: 'https://example.com/files/report.pdf', to: 'png', page: 1, dpi: 144 },
  extract: { urls: ['https://example.com/pricing'], prompt: 'every plan name and its monthly price' },
  screenshot: { url: 'https://example.com', fullPage: true, format: 'png', viewport: { width: 1440, height: 900 } },
  search: { query: 'transactional email APIs', limit: 5, scrapeOptions: { formats: ['markdown'] } },
  map: { url: 'https://example.com' },
  crawl: { url: 'https://example.com', limit: 100, maxDepth: 3, estimate: true },
  interact: { url: 'https://example.com/shop', actions: [{ type: 'click', selector: '#accept-cookies' }, { type: 'screenshot' }, { type: 'extract', prompt: 'Get the price of the first result' }] },
  monitor: { url: 'https://example.com/pricing', schedule: '0 * * * *', sensitivity: 'significant', webhook: 'https://your.app/webhooks/helix' },
};
