/**
 * Every Helix version, newest first. One entry per version.
 *
 * Sources, per entry: the git tag, the version history of the root `package.json`, the release commit message and
 * the diff, with `context.md` for 1.18.0 onward. `kind` records how a version was released:
 * `tagged`      a `v<version>` tag sits on a Helix commit.
 * `untagged`    the manifest carried the version but no tag was cut.
 * `foreign-tag` the tag exists but belongs to another project merged into the history (Canvas).
 * `baseline`    the first manifest version; never released.
 * `scripts/check-changelog.mjs` compares this list with the tags and the manifest history.
 */
export type ReleaseKind = 'tagged' | 'untagged' | 'foreign-tag' | 'baseline';

export interface ChangelogEntry {
  version: string;
  date: string;
  kind: ReleaseKind;
  commit: string;
  lead?: string;
  body: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '2.3.2',
    date: '2026-10-07',
    kind: 'tagged',
    commit: '6de117b',
    body: [
      'The Playground’s tab labels now stay on their tabs when the window is narrow. The grouped tab strip was clamped to the window width while its tabs overflowed, so labels such as Discover, Extract and Crawl drifted onto the wrong tabs. The strip and its labels now scroll together.',
      'We checked the fix with the type checker only. The app sits behind the desktop download, so we have not seen the change rendered. No installer was published for this version.',
    ],
  },
  {
    version: '2.3.1',
    date: '2026-10-07',
    kind: 'tagged',
    commit: 'ff21cd8',
    body: [
      'We removed the Canvas tool from Helix. Its server, its four website pages, and the navigation and footer links are gone, and Canvas continues as a separate project. It had joined Helix in 1.17.0, and its history stays in git.',
      'The app also shows real logos for Windows, Apple, Linux and the supported agent clients wherever it names them, in place of generic icons. No installer was published for this version.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-10-06',
    kind: 'untagged',
    commit: '9574d0d',
    lead: 'Scraping gets past more protected sites, and search has a backend.',
    body: [
      'On our own set of 32 web addresses, the share of requests that returned a page with real content rose from 69.8% to 75.9%, and the median time fell from 800 ms to 417 ms. Each address ran 4 times on one PC on October 6, 2026. Helix now starts every scrape with a quick request that looks like a browser, and moves up to a full browser only when the page needs one. It remembers which level worked for each site for 30 minutes, and sends a site’s cookies back to it on later requests.',
      'A timeout is now shared across those levels. Before, a Reddit request could hang for the full 180 seconds. Search results now come from a SearXNG instance that we run in Docker; the desktop app does not include one yet. Airbnb, G2, Zillow and Indeed still block us even at the browser level, and Reddit’s human check still comes back as an empty success. This version was never tagged, and the v2.3.2 tag includes it. No installer was published for it.',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-10-03',
    kind: 'tagged',
    commit: '51ff2dc',
    lead: 'The tool list that AI clients load is about a third of its size.',
    body: [
      'An AI client pays for every tool description in context each time it connects to Helix. The core tool list fell from 97,224 to 34,665 characters, measured on October 2, 2026, with every option and required field kept. Responses are lighter as well: a scrape of example.com went from 1,415 to 1,048 characters, and screenshots arrive as images instead of encoded text.',
      'The release also carries a rewrite of the website and docs in plain language, a microphone button in the desktop agent box that transcribes your speech on your PC, and Markdown with math and highlighted code in results. The first use of dictation downloads its speech model. Limit: prose that explained how two options interact is no longer in the tool list, and the API still rejects a bad combination with a 400 that says why. No installer was published for this version.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-09-26',
    kind: 'tagged',
    commit: '8d40fe2',
    lead: 'You can search what a crawl stored.',
    body: [
      'A new search finds pages by meaning inside the vectors that a crawl wrote to its destination, through `POST /v1/vectors/search` and a matching tool for AI clients. It works with Qdrant and with the built-in store in the desktop app. A collection embedded with a different model answers 409 instead of returning poor matches.',
      'Crawls and batch jobs also stopped losing pages. A URL such as `https://example.com` was fetched and then dropped, and discovered links were claimed before they were saved. A job now names any page it lost, a page with under 200 characters of text moves up a level, and each job can report the level and cost of every page. Helix offers a running Ollama instead of asking for its address. Limit: the first search after install waits while the embedding add-on downloads, and it answers 503 and asks for a retry in 30 seconds. The installer is Helix-Setup-2.1.0.exe on the releases page.',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-09-26',
    kind: 'tagged',
    commit: 'a3895f4',
    lead: 'Helix is now a Windows desktop app.',
    body: [
      'One installer, 265 MB, sets up Helix for your Windows user. It runs its own database, needs no account and no outside server, and serves its interface on `127.0.0.1:7410`, reachable from your PC only. The installer is not code-signed, so Windows asks you to confirm before it runs.',
      'This is a major release because hosted mode and the external database are gone: the product is an installed app. Limit: we tested the installed app on one PC, and a crawl of 500 pages on the built-in database has not been timed. The installer is Helix-Setup-2.0.0.exe on the releases page.',
    ],
  },
  {
    version: '1.24.0',
    date: '2026-09-25',
    kind: 'tagged',
    commit: 'ea12933',
    lead: 'Hosted mode, the Converter and Vulcan leave Helix.',
    body: [
      'The website keeps its landing page and docs, and the app moves behind a Download page. Sign-in, accounts and the Supabase database are gone from the website. File conversion lives in Sparky now, so `POST /v1/convert` and its tool no longer exist. Vulcan, added in 1.20.0, became its own project.',
      'Operators can trim the tools an AI client sees with `HELIX_MCP_TOOLS`, and tool results are now compact JSON instead of indented text. A batch-cancel tool had shipped without its confirmation step, and it has one now. These removals break existing callers, and we shipped them as a minor version. The desktop app followed the next day as 2.0.0.',
    ],
  },
  {
    version: '1.23.1',
    date: '2026-09-12',
    kind: 'tagged',
    commit: 'd8b8fe4',
    lead: 'Four audits, and every fix started as a failing test.',
    body: [
      'We audited performance, build speed, security and hidden bugs across the whole project. Map, crawl and the robots check now refuse private network addresses the way scrape already did, and they re-check every redirect. A path trick can no longer skip the key check. The compose file stopped publishing two internal services to the host.',
      'Reliability fixes include requests that no longer hang when a browser restarts during shutdown, monitors that stay quiet on whitespace-only edits, and schedules that refuse intervals cron cannot express evenly. Dashboard fixes stop a slow response from overwriting a newer one. One item stays open: pinning the resolved address across all three fetch levels, which would close a DNS rebinding gap.',
    ],
  },
  {
    version: '1.23.0',
    date: '2026-09-10',
    kind: 'untagged',
    commit: 'b40afab',
    lead: 'A crawl whose worker was killed can be picked up again.',
    body: [
      'Before this version, a crawl that lost its worker stayed marked as running forever. No worker would claim it, and resuming it was refused because it looked busy, so the documented recovery path was shut against the failure it exists for. Crawl jobs now carry a lease that expires, and a restart reclaims them.',
      'The Checks screen also gained interfaces for robots, page diffs, PDF assessment and selector testing, and the agent box grows as you type, with Shift+Enter for a new line.',
    ],
  },
  {
    version: '1.22.0',
    date: '2026-09-07',
    kind: 'tagged',
    commit: 'f06f60d',
    lead: 'Vulcan gets its own flame and an animated fire.',
    body: [
      'The mark is redrawn as a forge flame with three tongues and an amber core, picked from three candidates rendered at 16, 32 and 160 px. Behind the page header, two plumes of ASCII characters rise from the hairline at 18 frames per second while in view. Under reduced motion they show one still frame. Vulcan also joined the Tools menu and the footer.',
    ],
  },
  {
    version: '1.21.1',
    date: '2026-09-07',
    kind: 'tagged',
    commit: 'c6b7a5c',
    body: [
      'Vulcan’s sidebar row now stays visible, with a lock and a localhost label, when the server is not on localhost. Its page explains why instead of showing a missing page. Version 1.20.1 had hidden the row, which read as a missing feature.',
    ],
  },
  {
    version: '1.21.0',
    date: '2026-09-07',
    kind: 'tagged',
    commit: '7df95c2',
    lead: 'Vulcan gains latency, tool errors, a cost heatmap and its own palette.',
    body: [
      'New panels show spend per day by model, cost by weekday and hour, spend by project, the costliest sessions, reply latency and size, and error counts per tool. Reply latency stops at 15 minutes so that a resumed session does not read as a three-hour reply. The first read of 3.1 GB of transcripts went from 18 s to 28 s, because Helix now also reads the user lines.',
      'Vulcan’s warm near-black palette and five-step ember ramp apply to Vulcan only. The rest of the dashboard keeps its own colors.',
    ],
  },
  {
    version: '1.20.1',
    date: '2026-09-07',
    kind: 'tagged',
    commit: 'b1f3282',
    body: [
      'Vulcan now exists only when the server is reached on localhost. On the public deployment its page and data route answer 404, because the empty state in 1.20.0 looked the same as a local machine with no transcripts.',
    ],
  },
  {
    version: '1.20.0',
    date: '2026-09-07',
    kind: 'tagged',
    commit: '80ecbe3',
    lead: 'Vulcan, a spend dashboard for your own Claude Code sessions.',
    body: [
      'Vulcan reads the session logs on the PC that runs Helix and charts spend per day, cost by model, token types, cache writes, tool calls and context growth. Nothing is uploaded and no database table is involved. It counts a streamed reply once, prices cache writes by lifetime (5 minutes at 1.25 times, 1 hour at 2 times), and counts duplicate lines in subagent files once.',
      'On a real corpus of 4,550 files and 3.1 GB, the first read took 18 s and later reads took 0.3 s. On the hosted site there is nothing to read, and the page says so.',
    ],
  },
  {
    version: '1.19.1',
    date: '2026-09-07',
    kind: 'tagged',
    commit: 'aeb8ba6',
    body: [
      'A provider’s base URL is now checked against the private-address guard before it is stored. Before, a caller could point an instance at `169.254.169.254` and read the host’s cloud credentials back out of the response. Local runtimes such as Ollama and vLLM can still use loopback and LAN addresses, and every URL still has to be well formed.',
    ],
  },
  {
    version: '1.19.0',
    date: '2026-09-07',
    kind: 'tagged',
    commit: '12c311a',
    lead: 'Provider keys are checked before they are saved.',
    body: [
      'Helix now sends one cheap request with a key before storing it. It refuses a key the provider rejects, and it stores a key it could not check, with a warning, so an outage never rejects a good key. Before, a mistyped or revoked key showed a green Connected badge until an extraction failed.',
      'Model lists now come from each provider’s own catalogue, merged over a curated list. Helix also describes itself as a frontier utility hub across the product and docs.',
    ],
  },
  {
    version: '1.18.0',
    date: '2026-09-06',
    kind: 'untagged',
    commit: '9c8d095',
    lead: 'The Converter moves inside the dashboard and converts documents.',
    body: [
      'It had been unreachable on the deployed site for three releases, because an empty setting silently removed its menu rows. The Converter now lives at `/convert` and ships with every deploy. Its styles are scoped so they do not restyle the rest of the site.',
      'Documents become a third engine beside video and images, and the picker offers only pairs that the worker can actually convert. The Converter left Helix in 1.24.0.',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-09-05',
    kind: 'untagged',
    commit: 'e8a10ee',
    lead: 'Canvas LMS becomes a Helix tool.',
    body: [
      'The Canvas MCP server joined Helix with its history intact, and the website gained four Canvas pages and a Tools menu entry with the Instructure mark. Its web transport now needs a shared secret, because without one anyone who found the URL could use the Canvas token. Canvas left Helix in 2.3.1.',
    ],
  },
  {
    version: '1.16.2',
    date: '2026-09-05',
    kind: 'untagged',
    commit: 'f9a6c96',
    body: [
      'The Anthropic path stopped forcing tool use, which newer models reject with a 400 error. Two waits that could hang without limit now time out, and the extract and parse routes pass a cancel signal through.',
    ],
  },
  {
    version: '1.16.1',
    date: '2026-09-05',
    kind: 'untagged',
    commit: 'bd5ef28',
    body: [
      'Cancelling a crawl now stops the work in progress, including the model call that bills your own provider. Before, a crawl whose last page took 2 minutes could not notice a cancel for 2 minutes. A cancelled page returns to the queue, so a resume retries it without counting a failure.',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-09-05',
    kind: 'untagged',
    commit: 'a9e9003',
    lead: 'Structured extraction gets a fallback chain, a price and a real abort.',
    body: [
      'If a provider fails for a transport reason such as authentication, a rate limit or a timeout, Helix tries the next provider you have credentials for. It never sends one provider’s key to another, and the result names the provider that answered. Content and schema errors never trigger a fallback.',
      'Each result now carries a cost in US dollars from a pinned price table. A model without a cited price returns no cost instead of a guessed zero, and a local model costs a true zero. A caller that disconnects during a parse now stops the model call.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-09-05',
    kind: 'untagged',
    commit: 'faa3435',
    lead: 'The Converter records your screen, locally.',
    body: [
      'You can capture a window, a tab or the whole screen for up to 30 minutes, with an optional microphone, then save the result as MP4 or GIF. Recording, encoding and storage stay in your browser tab. Chunks are saved every second, so a crash at minute 29 costs one second of footage.',
      'The same release fenced untrusted page content before it reaches a model provider.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-09-05',
    kind: 'untagged',
    commit: 'a5fdc68',
    lead: 'The new products become callable, and Crawl returns a table.',
    body: [
      '`POST /v1/document` runs parse, convert, metadata, scrub or assess, and `POST /v1/extract` applies one schema across up to 25 URLs and returns rows. Screenshot gained full page, selector, clip, format, quality, viewport, dark mode and ad blocking. Extraction drops a field with no supporting text in the page and lists it, instead of returning a plausible number nobody can check.',
      'Crawl gained content filters, a per-path page budget for calendar and facet traps, resume for a cancelled job, and a separate cost estimate. A crawl now reports how many pages it filtered, capped and extracted.',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-09-05',
    kind: 'untagged',
    commit: '143d60a',
    lead: 'Screenshot and extraction become named products.',
    body: [
      'Both were already shipped code with no name, no page and no menu row. They now have pages, beside a Document product that groups Parse, Convert, Metadata and Assess. The navigation is built from the product list, so a menu row appears when a product is switched on. Three docs pages that had been dead links now resolve.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-09-05',
    kind: 'untagged',
    commit: 'f0317af',
    lead: 'The Converter stops trusting a server.',
    body: [
      'Conversion now runs entirely in your browser, so a file never makes a round trip to a server. An optional Ask AI field turns a typed request into the same validated settings the picker uses, with your own provider key.',
      'A separate addition, `POST /v1/convert`, lets an agent change a fetched file’s format mid-crawl, such as a PDF page into PNG or JPEG. Screenshots now skip text extraction without weakening block detection.',
    ],
  },
  {
    version: '1.11.3',
    date: '2026-09-04',
    kind: 'tagged',
    commit: '7663e90',
    body: [
      'The container image installs only Chromium, so asking for the Firefox or WebKit engine failed at launch with a message that said nothing about the fix. A build argument, `HELIX_BROWSER_ENGINES`, now adds the extra engines, and the error names it.',
    ],
  },
  {
    version: '1.11.2',
    date: '2026-09-04',
    kind: 'tagged',
    commit: '5998444',
    body: [
      'A new `schema-idempotent.sql` can be run twice. The original schema file only bootstraps a fresh project, so it failed on a database that already had the tables. We ran the new file twice against the live project to confirm it.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-09-04',
    kind: 'tagged',
    commit: '370f5d3',
    body: [
      'Two tables were readable and writable with the public browser key. Their migrations create them outside Supabase’s own setup, so row-level security was off. We confirmed the exposure against the live project and then closed it.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-09-04',
    kind: 'tagged',
    commit: 'c922f31',
    lead: 'Three holes that let one hosted user reach another’s data are closed.',
    body: [
      'On a hosted instance, any user could list and revoke every other user’s keys, read every other user’s jobs and scraped content, and see instance-wide traffic. A multi-tenant switch now withholds those routes and scopes jobs to the caller’s key. Five routes that had no tests now have them, and the SDK reaches enrich and usage.',
      'The first browser pass over the interface also found the status page claiming All services are online before any check ran. Hosted mode was removed in 1.24.0.',
    ],
  },
  {
    version: '1.10.3',
    date: '2026-09-04',
    kind: 'tagged',
    commit: 'ce1f584',
    body: [
      'A check of every link on the live site found three dead ones. The GitHub address `github.com/helix-dev/helix` does not exist, and it had been hard-coded in ten places, so every GitHub and license link returned 404. The address now lives in one place, and 265 build files that were committed by mistake left version control.',
    ],
  },
  {
    version: '1.10.2',
    date: '2026-09-04',
    kind: 'tagged',
    commit: '270d324',
    body: [
      'The Converter moved into Capabilities in the nav and the footer, because it is something Helix does, not a utility beside it. A report that the Converter was not working turned out to be the app not running. Once started, it answered in 7 seconds.',
    ],
  },
  {
    version: '1.10.1',
    date: '2026-09-04',
    kind: 'tagged',
    commit: '0d4468c',
    body: [
      'The Converter link appears in the footer. In 1.10.0 the setting that holds its address defaulted to empty, and an empty value hid the row. The default now names where the app actually runs.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-09-04',
    kind: 'tagged',
    commit: 'dd37dfc',
    lead: 'The footer carries every surface, and the research-preview label goes.',
    body: [
      'A new Tools column lists the Playground, Agent, Health, API keys, Settings, Persona and the Converter. The Research preview label on the Agent row was the only one on the site, and it is removed.',
      'The release also traced three stacked faults behind an AI providers failure. The API never read its own `.env`, a database address pointed at a server that did not exist, and a password with brackets must be percent-encoded inside a connection URL.',
    ],
  },
  {
    version: '1.9.2',
    date: '2026-09-04',
    kind: 'tagged',
    commit: 'd4e8052',
    body: [
      'The API now reads its own `.env`, and three migrations that had never been applied went live. One of them is the lease fix from 1.7.0, so the bug it repaired had been live the whole time. The providers panel also stops implying a bad credential when the service is simply absent.',
    ],
  },
  {
    version: '1.9.1',
    date: '2026-09-04',
    kind: 'tagged',
    commit: 'cff8d58',
    body: [
      'The drifting code animations left the page margins. Two separate things had put moving code down both edges of the landing page, and both are gone. The character fields behind headings stay, because they read as texture under the content.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-09-04',
    kind: 'tagged',
    commit: '2ca4208',
    lead: 'The landing page closes its gap to the reference, and the prompt box types.',
    body: [
      'Capabilities gains a card row, Performance becomes a real table, and every cell now links to a page that exists. Ctrl+K gets a visual design, and the prompt box types its placeholder.',
      'We did not copy the reference’s measured figures. Writing them here would invent a benchmark that Helix had not run, so every number on the page is labelled as a sample.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-09-04',
    kind: 'tagged',
    commit: 'a1cbede',
    lead: 'Settings becomes an account surface, Ctrl+K works everywhere, and an overflow bug is fixed at its source.',
    body: [
      'A modal’s content spilled outside its own border because the dialog component let one long line widen its panel. We fixed the component and then five more places with the same shape, including a freshly generated API key that collided with its copy button.',
      'Hosted Settings gained account, preferences, usage and a danger zone. Usage is stored in hourly buckets, because the job table alone would have left out most of the product. Ctrl+K searches navigation, docs, keys, monitors and recent runs, and it keeps subjects and times only, never bodies or keys.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-09-04',
    kind: 'tagged',
    commit: 'b9fb65c',
    lead: 'Hosted can call its own API, engines are a choice, and the crawler stops losing pages.',
    body: [
      'The hosted playground, agent and providers panel were dead because each threw when no browser key existed. Server routes now resolve a key per profile and forward the call, so the browser never holds one. Chromium stays the default, Firefox and WebKit are selectable per request, and an optional Camoufox level is available by name. The private-address guard is proven on all three engines against a real loopback server.',
      'A killed crawl worker used to leave its pages marked running forever, and the crawl reported fewer pages than it queued with no failure recorded. Tasks now carry leases that expire, evaluated by the database clock. Block verdicts now reach the concurrency controller, which matters because a Cloudflare interstitial arrives as HTTP 200. Map also became a product endpoint, and the site gained pages for five endpoints that had none.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-03',
    kind: 'untagged',
    commit: '845083e',
    lead: 'The landing page loses its 2×2 rhythm, the nav gets full menus, and muted text renders muted.',
    body: [
      'Muted text had emitted no style at all in 129 places, because a color utility cannot take an opacity when it wraps a bare variable. The fix is channel tokens. The status page now polls a health route with per-service latency, backed by samples taken every 60 seconds and kept for 90 days.',
      'The hero and the playground share one prompt box, and onboarding asks where you heard about Helix. The Converter, a separate app, reached its own 1.0.0 in the same range.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-03',
    kind: 'untagged',
    commit: '8498e23',
    lead: 'The landing page gets live meters and a bento grid.',
    body: [
      'Reliability bars grow from zero when scrolled into view and drift slightly after, and the capability pages use the same bento layout. Reduced motion pins every bar. The meter values are illustrative and the panel says so; none is a measured benchmark.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-03',
    kind: 'tagged',
    commit: 'f7fb967',
    lead: 'The Metadata API shows what a file gives away, and returns a copy without it.',
    body: [
      '`POST /v1/metadata` scans a PDF, DOCX, PPTX, XLSX, PNG or JPEG for EXIF, GPS, XMP, PDF document info and Office properties. `POST /v1/metadata/scrub` returns the cleaned file as the response body, with its report in a header. Findings are ranked by risk, and GPS is shown as a decimal coordinate pair, not a raw degrees-minutes-seconds triple.',
      'Removal is structural: a metadata segment is dropped whole, because an empty one still shows that the file once carried it. Limit: the PDF library cannot remove document info, so the scrub re-scans its own output and lists what remains. A Word comments part is kept on purpose, with a warning, because deleting it would corrupt the file.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-03',
    kind: 'untagged',
    commit: 'c0dbbe8',
    lead: 'Onboarding arrives, and the hosted app stops asking for a key it never gave you.',
    body: [
      'A signed-in hosted user used to meet a Connect to your Helix instance screen before they had created anything. Hosted now skips it, and a five-step wizard takes its place; its last step orders the sidebar by what you chose. If the profile store is unavailable, the app lets you in instead of sending you to a wizard that cannot save.',
      'Limit: both database migrations in this version were checked for syntax only, because no Postgres ran on the build machine.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-02',
    kind: 'tagged',
    commit: '5152bb0',
    lead: 'The Persona library grows from a first set to a full library.',
    body: [
      'Persona is Helix’s system-prompt library. New personas arrived for every new role, each refined to one bar: second-person, imperative instructions with exact output templates, decision rules, refusal language and checkable escalation triggers. Every persona carries a platform guide and a model setup guide.',
      'The sidebar gained an Editor tab with rename, duplicate, copy, export and delete. The landing page was reworked, and dark mode now follows the system setting.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-02',
    kind: 'tagged',
    commit: 'ae5e6d6',
    lead: 'Persona ships, and Supabase goes live.',
    body: [
      'Persona is a system-prompt library with a landing page, a role grid, a step-by-step wizard and an editor with autosave and export to Markdown, text, JSON and PDF. Supabase is linked and the Clerk sign-in to key to row round trip is proven. The hero also gained a Copy setup prompt button, written for the agent to follow.',
      'Dashboard route handlers dropped the `.hosted.ts` extension, because Vercel’s builder failed every hosted deploy on the file it could not find.',
    ],
  },
  {
    version: '1.0.2',
    date: '2026-09-05',
    kind: 'foreign-tag',
    commit: 'a8ecb12',
    body: [
      'Helix has no version 1.0.2. The tag `v1.0.2` belongs to the Canvas server, tagged CanvasLMS-API 1.0.2 (retries, cache invalidation and per-tool timeouts), and it entered this repository’s history when that project was merged on September 5. We list it so that every tag in the repository is accounted for.',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-08-29',
    kind: 'tagged',
    commit: 'a1f56c0',
    body: [
      'A WebSocket live view now sits at `/v1/interact/live/{id}/ws` beside the existing stream. It was the one item 1.0.0 shipped without, because it needed a dependency the repository did not carry. On September 2 the version line was reset to 1.0.0 and this version folded in, so the manifest no longer reports it. The tag remains.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-29',
    kind: 'tagged',
    commit: 'e580d1b',
    lead: 'The first release: a web-data API you run yourself.',
    body: [
      'Helix 1.0.0 scrapes, parses, searches, maps, crawls, interacts with pages, monitors and enriches, and it ships with an MCP server, a command line and a TypeScript SDK. We verified it against real services instead of mocks: all four runtimes healthy, a crawl storing real embeddings in a live Qdrant, and a real generation through a local model. This entry also covers everything built since the 0.1.0 baseline.',
      'Limits: every live model result came from a model of 4 to 8 billion parameters, pgvector was not verified against a real server, stealth was not verified against a commercial anti-bot system, and the WebSocket live view was not built. A second commit on September 2 restated the version as 1.0.0 after the number had briefly read 1.0.1. It added Supabase as the one database for the hosted site, real API keys and the Persona plan. The tag stays on the August 29 commit.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-08-24',
    kind: 'baseline',
    commit: 'ea4a6fe',
    body: [
      'The repository began as a monorepo skeleton with research notes and API specs. This version was never released, and no notes were kept for it beyond that. The work between this baseline and 1.0.0 is described under 1.0.0.',
    ],
  },
];

export interface ChangelogSeries {
  id: string;
  label: string;
  entries: readonly ChangelogEntry[];
}

export function versionId(version: string): string {
  return `v${version.replace(/\./g, '-')}`;
}

export function seriesOf(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

export function groupBySeries(entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogSeries[] {
  const out: { id: string; label: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const label = seriesOf(entry.version);
    const last = out[out.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else out.push({ id: `series-${label.replace('.', '-')}`, label, entries: [entry] });
  }
  return out;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function kindNote(entry: Pick<ChangelogEntry, 'kind' | 'version'>): string {
  if (entry.kind === 'tagged') return `Tag v${entry.version}`;
  if (entry.kind === 'untagged') return 'No tag';
  if (entry.kind === 'foreign-tag') return 'Tag from Canvas';
  return 'Baseline, never released';
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const HYPE = /\b(revolutionary|game-changing|seamless(ly)?|unlock(s|ed|ing)?|supercharge[sd]?|empower(s|ed|ing)?|cutting-edge|amazing|magical|excited|thrilled|journey|blazing)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

/** Returns every problem found in a changelog list; an empty array means it is sound. */
export function validateChangelog(entries: readonly ChangelogEntry[] = CHANGELOG): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const at = `entry ${e.version}`;
    if (!SEMVER.test(e.version)) problems.push(`${at}: version is not MAJOR.MINOR.PATCH`);
    if (seen.has(e.version)) problems.push(`${at}: listed twice`);
    seen.add(e.version);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || Number.isNaN(Date.parse(e.date))) problems.push(`${at}: date is not YYYY-MM-DD`);
    if (!/^[0-9a-f]{7}$/.test(e.commit)) problems.push(`${at}: commit is not a 7-character hash`);
    if (e.body.length === 0 || e.body.some((p) => p.trim() === '')) problems.push(`${at}: body is empty`);
    const patch = Number(e.version.split('.')[2]);
    if (patch === 0 && e.kind !== 'baseline' && !e.lead) problems.push(`${at}: a minor or major release needs a lead`);
    const next = entries[i + 1];
    if (next && SEMVER.test(e.version) && SEMVER.test(next.version) && compareSemver(e.version, next.version) <= 0) {
      problems.push(`${at}: not above ${next.version}; the list must descend by version`);
    }
    if (next && e.kind !== 'foreign-tag' && next.kind !== 'foreign-tag' && e.date < next.date) {
      problems.push(`${at}: dated ${e.date}, earlier than the older ${next.version} (${next.date})`);
    }
    const text = [e.lead ?? '', ...e.body].join(' ');
    if (text.includes('!')) problems.push(`${at}: exclamation mark`);
    if (EMOJI.test(text)) problems.push(`${at}: emoji`);
    if (HYPE.test(text)) problems.push(`${at}: hype word "${HYPE.exec(text)?.[0]}"`);
    if (/ — | –|— |– /.test(text)) problems.push(`${at}: dash with a space around it`);
    if (e.lead && !/[.?]$/.test(e.lead)) problems.push(`${at}: lead must end with a full stop`);
  });
  return problems;
}
