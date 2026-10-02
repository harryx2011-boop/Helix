import type { LucideIcon } from 'lucide-react';
import {
  BellRing,
  Camera,
  CalendarClock,
  CircleSlash,
  Crop,
  Eye,
  FileStack,
  Files,
  Filter,
  Gauge,
  GitBranch,
  GitCompareArrows,
  Globe2,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  Map as MapIcon,
  MousePointerClick,
  Quote,
  RefreshCw,
  ScanEye,
  ScanSearch,
  Search,
  ShieldCheck,
  ShieldHalf,
  SlidersHorizontal,
  Table2,
  Timer,
  FileText,
  Network,
  Braces,
  Sparkles,
  Calculator,
  Crosshair,
  Layers3,
} from 'lucide-react';

/**
 * Marketing copy for each thing Helix does, in plain words. One registry feeds the
 * feature pages, the home cards, the nav and the footer, so a name changes in one place.
 * The catalog (`lib/catalog.ts`) keeps the API names the signed-in app uses.
 */
export type FeatureId =
  | 'scrape'
  | 'document'
  | 'extract'
  | 'screenshot'
  | 'search'
  | 'map'
  | 'crawl'
  | 'interact'
  | 'monitor'
  | 'enrich'
  | 'batch'
  | 'agent';

export interface FeatureCard {
  icon: LucideIcon;
  lead: string;
  body: string;
}

export interface FeatureCopy {
  id: FeatureId;
  route: string;
  /** Short plain label for the nav, footer and home cards. */
  name: string;
  /** One sentence for a card. */
  blurb: string;
  icon: LucideIcon;
  /** Nav column: what the person is trying to do. */
  group: 'Read' | 'Find' | 'Act and watch';
  title: string;
  description: string;
  h1: [string, string];
  subhead: string;
  mock: { chrome: 'browser' | 'terminal'; label: string; code: string };
  cards: [FeatureCard, FeatureCard, FeatureCard, FeatureCard];
  /** The technical page for this feature. */
  docs: string;
  /** True when the home page lists it. */
  home?: boolean;
}

export const FEATURES: readonly FeatureCopy[] = [
  {
    id: 'scrape',
    route: '/scrape',
    name: 'Read a page',
    blurb: 'Turn any web page into clean text, a list of its links or a screenshot.',
    icon: FileText,
    group: 'Read',
    home: true,
    title: 'Read a page',
    description: 'Give Helix a link and get the page back as clean text, links or a screenshot, without the menus and ads.',
    h1: ['Any page,', 'read cleanly.'],
    subhead: 'Paste a link. Helix opens the page and hands back the part you came for, as plain text, a list of links or a screenshot.',
    mock: {
      chrome: 'browser',
      label: 'example.com/pricing',
      code: `Pricing

Simple, transparent pricing

Standard
$29 a month, billed annually.

Pro
$79 a month. Includes priority support.`,
    },
    cards: [
      { icon: Globe2, lead: 'Starts simple, steps up when needed.', body: 'Helix tries an ordinary visit first and moves to a full browser only when a site pushes back.' },
      { icon: FileText, lead: 'Menus and ads left out.', body: 'You get the article, the table or the listing, not the page furniture around it.' },
      { icon: MousePointerClick, lead: 'Click first, then read.', body: 'Dismiss a cookie banner, open a tab or scroll before Helix reads the page.' },
      { icon: ShieldCheck, lead: 'A block is reported as a block.', body: 'If a site shows a "prove you are human" page, Helix says so instead of handing it back as if it were the real page.' },
    ],
    docs: '/docs/scrape',
  },
  {
    id: 'document',
    route: '/document',
    name: 'Read a document',
    blurb: 'Open PDFs, Word, PowerPoint and Excel files and get their text and tables.',
    icon: Files,
    group: 'Read',
    home: true,
    title: 'Read a document',
    description: 'Open PDF, Word, PowerPoint and Excel files, from a link or your own computer, and get the text and tables back.',
    h1: ['Every document,', 'ready to use.'],
    subhead: 'PDF, Word, PowerPoint and Excel files, from a link or from your computer. Helix returns the text and keeps the tables as tables.',
    mock: {
      chrome: 'browser',
      label: 'invoice.pdf',
      code: `Invoice 0142

Bill to: Acme Co.
Total: $4,820.00

Item          Qty    Price
Consulting     40    $100.00`,
    },
    cards: [
      { icon: FileStack, lead: 'Four file types, one result.', body: 'PDF, Word, PowerPoint and Excel all come back in the same shape.' },
      { icon: ScanEye, lead: 'Scanned pages are read too.', body: 'Helix checks whether a page has real text first. Only scanned pages are read as images.' },
      { icon: Table2, lead: 'Tables stay tables.', body: 'Spreadsheet rows, slide text and PDF tables are kept in order instead of being flattened into a paragraph.' },
      { icon: ShieldCheck, lead: 'See what a file gives away.', body: 'Check the author and software details hidden inside a file, and save a copy without them.' },
    ],
    docs: '/docs/document',
  },
  {
    id: 'extract',
    route: '/extract',
    name: 'Pull data into a table',
    blurb: 'Describe the facts you want and get them back as rows, each traced to the page.',
    icon: Braces,
    group: 'Read',
    title: 'Pull data into a table',
    description: 'Describe the facts you want from a page. Helix returns them as rows and shows where on the page each one came from.',
    h1: ['Describe what you want.', 'Get a table back.'],
    subhead: 'Say which facts you need from a page. Helix returns them as rows, and shows where on the page each value came from.',
    mock: {
      chrome: 'terminal',
      label: 'Pricing plans',
      code: `Plan          Monthly price   On the page
------------------------------------------
Starter       $0              yes
Pro           $79             yes
Enterprise    not stated      left out

2 rows kept, 1 value left out`,
    },
    cards: [
      { icon: Crosshair, lead: 'Every value shows its source.', body: 'Each field points to the spot on the page it was read from, so a wrong answer is easy to catch.' },
      { icon: ShieldCheck, lead: 'No guessing.', body: 'If the page does not support a value, Helix leaves it out and says so rather than filling the gap.' },
      { icon: Sparkles, lead: 'Describe it in a sentence.', body: 'Not sure how to lay out the table? Describe the data and Helix designs the columns for you.' },
      { icon: Layers, lead: 'Many pages, one table.', body: 'Give it a list of links and the same columns are filled in for each, as one table.' },
    ],
    docs: '/docs/extract',
  },
  {
    id: 'screenshot',
    route: '/screenshot',
    name: 'Take a screenshot',
    blurb: 'Capture a whole page, just the visible part or one section, as an image or PDF.',
    icon: Camera,
    group: 'Read',
    title: 'Take a screenshot',
    description: 'Capture a whole page, the visible part or one section as an image or PDF, with cookie banners and ads out of the way.',
    h1: ['The page as you see it,', 'saved as an image.'],
    subhead: 'Capture a whole page, only what fits on screen, or one section. Cookie banners and ads can be kept out of the shot.',
    mock: {
      chrome: 'browser',
      label: 'example.com, full page',
      code: `+------------------------------+
|  ====           __  __  __   |
|                              |
|  ############                |
|  ##################          |
|                              |
|  +--------+ +--------+       |
|  |        | |        |       |
|  +--------+ +--------+       |
+------------------------------+
  Saved as an image`,
    },
    cards: [
      { icon: Crop, lead: 'Whole page or one section.', body: 'Capture everything below the fold, just what fits, or the one part you need.' },
      { icon: Files, lead: 'Image or PDF.', body: 'Choose PNG, JPEG, WebP or PDF, and how sharp the image should be.' },
      { icon: ShieldHalf, lead: 'Cleaner shots.', body: 'Turn on ad and cookie-banner blocking, dark mode, or a see-through background.' },
      { icon: Timer, lead: 'Waits for the page to settle.', body: 'Hold for a delay or for an element to appear, so animations and slow images finish first.' },
    ],
    docs: '/docs/screenshot',
  },
  {
    id: 'search',
    route: '/search',
    name: 'Search the web',
    blurb: 'Search, then read every result in one go.',
    icon: Search,
    group: 'Find',
    home: true,
    title: 'Search the web',
    description: 'Search the web and read every result in one go. Needs a search source you set up.',
    h1: ['Search the web,', 'read every result.'],
    subhead: 'Ask a question and Helix returns the results with the text of each page attached, so you do not open them one by one.',
    mock: {
      chrome: 'terminal',
      label: 'Example search',
      code: `Search: transactional email services

1. 13 Best Transactional Email Services
   page text attached
2. Email service comparison, 2026
   page text attached
3. Choosing an email provider
   page unreadable (kept in the list)`,
    },
    cards: [
      { icon: Search, lead: 'Results come with their pages.', body: 'Each result arrives with the text of the page, ready to read.' },
      { icon: KeyRound, lead: 'Needs a search source.', body: 'Helix has no search engine of its own. You connect your own search server, or a key from a search service, in the app.' },
      { icon: Filter, lead: 'Narrow it down.', body: 'Limit by language, country or how recent the page is.' },
      { icon: ListChecks, lead: 'One bad page will not sink the search.', body: 'A page that cannot be read stays in the list with a note, and the rest still come back.' },
    ],
    docs: '/docs/search',
  },
  {
    id: 'map',
    route: '/map',
    name: 'List a site’s pages',
    blurb: 'See every page a site has, without opening any of them.',
    icon: MapIcon,
    group: 'Find',
    title: 'List a site’s pages',
    description: 'Get the list of pages a website has, without reading any of them.',
    h1: ['List a site’s pages,', 'open none of them.'],
    subhead: 'Get the list of pages a site has. Helix reads the site’s own page index and the links on the start page, and nothing else.',
    mock: {
      chrome: 'terminal',
      label: 'example.com',
      code: `example.com
  /pricing
  /pricing/enterprise
  /blog/pricing-update

3 pages listed, none opened`,
    },
    cards: [
      { icon: MapIcon, lead: 'Two sources, one list.', body: 'Helix combines the page index a site publishes with the links on its start page.' },
      { icon: Filter, lead: 'Filter by a word.', body: 'Keep only the addresses that contain a word you choose, such as "pricing".' },
      { icon: Link2, lead: 'No duplicates.', body: 'Addresses that differ only by tracking tags are folded into one.' },
      { icon: Gauge, lead: 'Know the size first.', body: 'Count the pages before you decide how much of a site to read.' },
    ],
    docs: '/docs/map',
  },
  {
    id: 'crawl',
    route: '/crawl',
    name: 'Read a whole site',
    blurb: 'Follow the links across a site and read every page, politely.',
    icon: Network,
    group: 'Find',
    home: true,
    title: 'Read a whole site',
    description: 'Follow the links across a whole website and read every page, at a polite pace, with an estimate before it starts.',
    h1: ['Whole sites,', 'read politely.'],
    subhead: 'Start from one page and Helix follows the links outward, reading each page. It follows the site’s own rules and slows down if the site struggles.',
    mock: {
      chrome: 'browser',
      label: 'example.com, 42 of 100 pages',
      code: `example.com
  /blog
  /blog/post-1    done
  /blog/post-2    done
  /blog/tag/x     skipped
  /pricing        waiting

42 of 100 pages read, still running`,
    },
    cards: [
      { icon: Gauge, lead: 'Slows down when a site does.', body: 'Helix reads several pages at once and backs off for a site that pushes back. Other sites keep their pace.' },
      { icon: GitBranch, lead: 'Link by link.', body: 'You choose how many clicks away from the start page it may go, and how many pages in total.' },
      { icon: ShieldHalf, lead: 'The site’s rules come first.', body: 'Pages a site asks automated visitors to avoid are skipped and reported, not silently dropped.' },
      { icon: Calculator, lead: 'An estimate before you start.', body: 'Ask for a projected page count and time before a single page is read.' },
    ],
    docs: '/docs/crawl',
  },
  {
    id: 'interact',
    route: '/interact',
    name: 'Click through a page',
    blurb: 'Open a page and click, type and scroll through it, then read what you reach.',
    icon: MousePointerClick,
    group: 'Act and watch',
    home: true,
    title: 'Click through a page',
    description: 'Open a page and click, type and scroll through it as a person would, then read what you reach. You can watch it happen.',
    h1: ['A browser that', 'works through it for you.'],
    subhead: 'Open a page, click, type and scroll as a person would, then read what you reach. You can watch it happen in a live view.',
    mock: {
      chrome: 'browser',
      label: 'Example session',
      code: `click     "Accept cookies"
type      "wireless keyboard" in the search box
press     Enter
wait      for the results
screenshot
read      "price of the first result"

Result: Keyboard available at $49.99`,
    },
    cards: [
      { icon: MousePointerClick, lead: 'The usual moves.', body: 'Go to a page, click, type, press a key, scroll, wait and take a screenshot, in order.' },
      { icon: Timer, lead: 'The page stays open.', body: 'Cookies and stored data carry over between steps until you close the session.' },
      { icon: Eye, lead: 'Watch it happen.', body: 'A live view shows the session as it runs. It is view-only, so nobody watching can click.' },
      { icon: ScanSearch, lead: 'Read what you reach.', body: 'One step reads the page and answers in a sentence, or fills the table you described.' },
    ],
    docs: '/docs/interact',
  },
  {
    id: 'monitor',
    route: '/monitor',
    name: 'Watch for changes',
    blurb: 'Re-read a page on a schedule and see exactly what changed.',
    icon: Eye,
    group: 'Act and watch',
    home: true,
    title: 'Watch for changes',
    description: 'Re-read a page on a schedule and see exactly what changed. A check that finds nothing new stays quiet.',
    h1: ['Know when', 'the web changes.'],
    subhead: 'Pick a page and a schedule. Helix re-reads it and shows you what changed. A check that finds nothing new stays quiet.',
    mock: {
      chrome: 'terminal',
      label: 'Change found on example.com/pricing',
      code: `  Standard
- $29 a month, billed annually.
+ $34 a month, billed annually.

  Pro
  $79 a month. Includes priority support.`,
    },
    cards: [
      { icon: BellRing, lead: 'No change, no noise.', body: 'A check that finds nothing new just records that it looked.' },
      { icon: CalendarClock, lead: 'Your schedule.', body: 'Check every few hours, daily, or at set times, in your time zone. The shortest gap between checks is one hour.' },
      { icon: GitCompareArrows, lead: 'See what moved.', body: 'The change is shown word by word, line by line or letter by letter.' },
      { icon: SlidersHorizontal, lead: 'Ignores the clutter.', body: 'Timestamps and tracking tags are filtered out before pages are compared.' },
    ],
    docs: '/docs/monitor',
  },
  {
    id: 'enrich',
    route: '/enrich',
    name: 'Research with sources',
    blurb: 'Give a company name and the facts you want. Each answer comes with its source.',
    icon: Quote,
    group: 'Find',
    title: 'Research with sources',
    description: 'Give a company name and the facts you want. Each answer comes with the sentence that backs it up, or an honest blank.',
    h1: ['A name in,', 'facts with sources out.'],
    subhead: 'Name a company and the facts you want. Each answer comes with the sentence that states it, or a blank and the reason Helix could not confirm it.',
    mock: {
      chrome: 'terminal',
      label: 'Example: Acme Robotics',
      code: `Fact           Answer     Source
-------------------------------------------
Headquarters   Zurich     acme.example/about
Founded        2014       acme.example/about
Public company not stated (left blank)`,
    },
    cards: [
      { icon: Quote, lead: 'Every answer quotes its source.', body: 'Helix checks the quote against the page it read, and the answer against the quote. If either check fails, the answer is left blank.' },
      { icon: CircleSlash, lead: 'A reason for every blank.', body: 'Not stated, no quote found, or the AI was unavailable. Nothing is invented to fill a column.' },
      { icon: Layers3, lead: 'The page’s own labels first.', body: 'Facts a page states in its hidden labels are read directly, without calling an AI. Only the rest goes to your AI account.' },
      { icon: ShieldCheck, lead: 'Junk pages are rejected.', body: 'Parked domains and placeholder pages cannot count as evidence, and each rejection is listed.' },
    ],
    docs: '/docs/api-reference',
  },
  {
    id: 'batch',
    route: '/batch',
    name: 'Read a list of pages',
    blurb: 'Hand over a long list of links and read them all as one job.',
    icon: Layers,
    group: 'Read',
    title: 'Read a list of pages',
    description: 'Hand Helix a long list of links, up to 10,000, and read them all as one job.',
    h1: ['A long list of links,', 'read as one job.'],
    subhead: 'Hand over up to 10,000 links. Helix reads them all at a polite pace, and every link gets its own result.',
    mock: {
      chrome: 'terminal',
      label: 'Example batch',
      code: `3 links submitted

  example.com/a        done
  example.com/b        done
  other.example/c      done

3 done, 0 failed`,
    },
    cards: [
      { icon: Layers, lead: 'Only the links you list.', body: 'Helix follows no other links. The list can span many sites, and duplicates are removed first.' },
      { icon: ListChecks, lead: 'One bad link will not fail the rest.', body: 'Each link carries its own result, and the job shows how many finished and how many failed.' },
      { icon: RefreshCw, lead: 'Check back or get a message.', body: 'The job runs in the background. You can check its progress or have it notify an address you choose, and you can cancel it and keep what finished.' },
      { icon: Gauge, lead: 'Polite to every site.', body: 'Limits per site, spacing between visits and the site’s own rules all apply, as with a full crawl.' },
    ],
    docs: '/docs/api-reference',
  },
  {
    id: 'agent',
    route: '/agent',
    name: 'Design a table from a sentence',
    blurb: 'Say what data you want and Helix designs the table for you.',
    icon: Sparkles,
    group: 'Read',
    title: 'Design a table from a sentence',
    description: 'Describe the data you want in a sentence and Helix designs the table layout for you.',
    h1: ['Say what you want,', 'get the table layout.'],
    subhead: 'Describe the data in a sentence. Helix designs the columns, and you can ask for changes in plain words.',
    mock: {
      chrome: 'browser',
      label: 'Agent',
      code: `You asked:
  Every pricing plan on the page, with its name,
  monthly price and included features.

Helix designed:
  Plans
    name            text
    monthly price   number
    features        list of text

Use it to pull data from any page`,
    },
    cards: [
      { icon: Sparkles, lead: 'A sentence in, a layout out.', body: 'The layout plugs straight into the table feature for pages, documents and search results.' },
      { icon: RefreshCw, lead: 'Ask for changes.', body: 'Send the last layout back with a note, such as "also capture whether a plan is most popular". The rest stays as it was.' },
      { icon: Link2, lead: 'Example pages shape the columns.', body: 'Give up to ten example links so the layout fits what the pages hold. Helix does not open them for this step.' },
      { icon: KeyRound, lead: 'Uses your own AI account.', body: 'It works with the AI account you connect, or with a model running on your own PC.' },
    ],
    docs: '/docs/api-reference',
  },
];

export const FEATURE_BY_ID: Record<FeatureId, FeatureCopy> = Object.fromEntries(FEATURES.map((f) => [f.id, f])) as Record<
  FeatureId,
  FeatureCopy
>;

export const FEATURE_GROUPS = ['Read', 'Find', 'Act and watch'] as const;
