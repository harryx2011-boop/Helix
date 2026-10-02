/**
 * The plain-language docs: install, how it works, settings, privacy and help.
 * The developer references (API, MCP, command line, one page per feature) stay in `docs-content.ts`.
 * Engine, model and port names are allowed here and nowhere else on the marketing site.
 */
export type Block =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string }
  | { code: string };

export interface DocSection {
  h: string;
  blocks: Block[];
}

export interface DocPage {
  slug: string;
  nav: string;
  group: 'Get Started' | 'Configure' | 'Privacy' | 'Help';
  title: string;
  intro: string;
  sections: DocSection[];
  next: { slug: string; why: string }[];
}

export const DOCS: DocPage[] = [
  {
    slug: 'quickstart',
    nav: 'Quickstart',
    group: 'Get Started',
    title: 'Quickstart',
    intro:
      'This guide takes you from download to your first result in a few minutes. By the end, Helix is installed on your PC and has read a web page for you.',
    sections: [
      {
        h: 'Before you begin',
        blocks: [
          {
            ul: [
              'Windows 10 or 11, 64-bit. Helix is a Windows app.',
              'An internet connection. The installer is about 250 MB.',
              'Nothing else. You do not need an account, and you do not need an AI key to read pages.',
            ],
          },
        ],
      },
      {
        h: 'Step 1: Install Helix',
        blocks: [
          {
            ol: [
              'Open the Download page and select Download for Windows.',
              'Run Helix-Setup-<version>.exe. It installs Helix for your Windows user only, lets you choose the folder, and adds a desktop shortcut and a Start menu entry.',
              'Windows may ask you to confirm before the installer runs, because the installer is not code-signed. See Help if you are unsure what to click.',
              'Helix opens when the installer finishes.',
            ],
          },
        ],
      },
      {
        h: 'Step 2: Let it start',
        blocks: [
          {
            p: 'A small start-up window shows Helix getting ready. It starts three parts: the engine that runs your requests and keeps your data, the page reader and the document reader. The main window opens when all three are up.',
          },
          {
            note: 'Closing the main window quits Helix. It does not keep running in the system tray.',
          },
        ],
      },
      {
        h: 'Step 3: Read your first page',
        blocks: [
          {
            ol: [
              'In the left menu, under Playground, open Scrape.',
              'Paste a web address into the box at the top, for example nextjs.org/docs.',
              'Select Start scraping.',
              'The result appears below as clean text. Use the tabs to switch between the text and the other formats you asked for.',
            ],
          },
          {
            p: 'The other items under Playground work the same way: paste an address, a file or a question, then run it.',
          },
        ],
      },
      {
        h: 'Step 4: Connect an AI account (optional)',
        blocks: [
          {
            p: 'Reading pages, documents and whole sites needs no AI. Pulling facts into a table, researching with sources and designing a table from a sentence do. To use them, open Settings and add an account under AI Providers, or point Helix at a model running on your PC. Settings and Models lists the choices.',
          },
        ],
      },
    ],
    next: [
      { slug: 'how-it-works', why: 'shows what runs on your PC and what happens when you ask for a page.' },
      { slug: 'settings-and-models', why: 'lists every AI provider and setting.' },
      { slug: 'help', why: 'covers the installer warning and what to do if something does not start.' },
    ],
  },
  {
    slug: 'how-it-works',
    nav: 'How It Works',
    group: 'Get Started',
    title: 'How it works',
    intro:
      'Helix is a small group of programs that run on your PC and work together. This page shows what runs where, and what happens when you ask for a page.',
    sections: [
      {
        h: 'What runs on your PC',
        blocks: [
          {
            table: {
              head: ['Part', 'What it does', 'Listens on'],
              rows: [
                ['The app window', 'What you see: the Playground, the Agent and Settings.', 'Not applicable'],
                ['The engine', 'Takes your requests, keeps your results and settings in a database, and hands work to the other parts. It also serves the app window.', '127.0.0.1, port 7410'],
                ['The page reader', 'Fetches pages over your own connection.', '127.0.0.1, port 7411'],
                ['The document reader', 'Reads PDF, Word, PowerPoint and Excel files, and prepares text for searching by meaning.', '127.0.0.1, port 7412'],
                ['A built-in browser', 'Opens pages that need a real browser, such as ones that build themselves with scripts. It ships inside Helix.', 'Not applicable'],
              ],
            },
          },
          {
            p: 'All three network ports answer only on your own PC (127.0.0.1). Other computers on your network cannot reach them.',
          },
        ],
      },
      {
        h: 'What happens when you read a page',
        blocks: [
          {
            ol: [
              'You paste an address and run it.',
              'The engine asks the page reader to fetch the page over your connection, with an ordinary visit first.',
              'If the site blocks that visit, Helix steps up: first a visit that looks like a real browser, then a full browser. It steps up only when a block is proven.',
              'A "prove you are human" page is reported as a block. It is never handed back as if it were the page.',
              'The page is cleaned into text, links, a screenshot or the table you described, and shown in the app.',
            ],
          },
        ],
      },
      {
        h: 'What needs an AI',
        blocks: [
          {
            ul: [
              'Pulling facts into a table (Extract, or the JSON format on a page or document).',
              'Researching with sources (Enrich).',
              'Designing a table from a sentence (the Agent).',
              'Field-by-field summaries of a change in a monitor.',
            ],
          },
          {
            p: 'Everything else works without one. Searching the web needs a search source instead. Settings and Models explains how to set one up.',
          },
        ],
      },
      {
        h: 'What is saved',
        blocks: [
          {
            p: 'Results, monitors, settings and your access keys are saved in the Helix folder on your PC. By default, crawl results stay readable for 7 days and a monitor keeps its last 30 snapshots or 90 days of history. Privacy and Data lists where each thing lives.',
          },
        ],
      },
    ],
    next: [
      { slug: 'settings-and-models', why: 'explains the AI providers and the limits you can change.' },
      { slug: 'privacy-and-data', why: 'says exactly what stays on your PC and what leaves it.' },
    ],
  },
  {
    slug: 'settings-and-models',
    nav: 'Settings and Models',
    group: 'Configure',
    title: 'Settings and models',
    intro:
      'Every choice you can make in Helix: which AI account to use, how to set up searching, and the limits that control how much Helix reads and how fast.',
    sections: [
      {
        h: 'Where settings live',
        blocks: [
          {
            p: 'Open Settings in the left menu. It has three parts.',
          },
          {
            ul: [
              'Preferences: appearance and your default choices. Saved on this device.',
              'AI Providers: the AI accounts and models Helix can use.',
              'Instance settings: the limits below. Each one says when it takes effect: immediately, after a restart, or after you confirm because it changes what Helix can reach.',
            ],
          },
        ],
      },
      {
        h: 'AI providers',
        blocks: [
          {
            p: 'Helix has no AI of its own. For the features that need one, you connect an account you already have and that provider bills you directly. You can also use a model that runs on your own PC.',
          },
          {
            table: {
              head: ['Provider', 'Where it runs', 'You enter', 'Example model shown in the box'],
              rows: [
                ['Anthropic', 'Anthropic’s cloud', 'API key', 'claude-sonnet-4-5'],
                ['OpenAI', 'OpenAI’s cloud', 'API key', 'gpt-4o-mini'],
                ['Gemini', 'Google’s cloud', 'API key', 'gemini-2.0-flash'],
                ['OpenRouter', 'OpenRouter’s cloud', 'API key', 'openrouter/auto'],
                ['Ollama', 'Your PC', 'Base URL', 'llama3.2'],
                ['vLLM', 'Your PC or your own server', 'Base URL', 'meta-llama/Llama-3.1-8B-Instruct'],
                ['OpenAI-compatible', 'Any server that speaks the same protocol', 'Base URL', 'Your choice'],
              ],
            },
          },
          {
            p: 'The example is only a hint in the model box. For a model on your PC, save the base URL first, then browse its models. After you save a key, Helix shows only its last four characters.',
          },
          {
            note: 'A cloud provider receives the text of the pages the feature reads. A model running on your own PC does not send it anywhere.',
          },
        ],
      },
      {
        h: 'Set up searching',
        blocks: [
          {
            p: 'Helix does not include a search engine. Until you give it a search source, searching answers "No search backend is configured". Reading pages works either way. Choose one source:',
          },
          {
            table: {
              head: ['Source', 'Windows variable to add', 'Notes'],
              rows: [
                ['SearXNG', 'SEARXNG_URL', 'Your own search server. No key needed, but you must run or reach one.'],
                ['Serper', 'SERPER_API_KEY', 'A key from Serper. Billed to you by Serper.'],
                ['SerpAPI', 'SERPAPI_KEY', 'A key from SerpAPI. Billed to you by SerpAPI.'],
              ],
            },
          },
          {
            ol: [
              'Press the Windows key, type "environment variables" and open Edit environment variables for your account.',
              'Under User variables, select New and add the variable from the table with its value.',
              'Quit Helix completely and open it again. Helix hands its own environment on to the parts it starts.',
            ],
          },
        ],
      },
      {
        h: 'Limits you can change',
        blocks: [
          {
            p: 'These are the most useful instance settings, with their defaults. The full list is in Settings.',
          },
          {
            table: {
              head: ['Setting', 'What it does', 'Default'],
              rows: [
                ['Respect robots', 'Skip pages a site asks automated visitors to avoid, when a request does not say.', 'On'],
                ['Crawl page limit', 'Pages a crawl reads when you do not set a limit. The largest limit you can ask for is 100,000.', '1,000'],
                ['Crawl depth', 'The most link levels a crawl may follow.', '50'],
                ['Pages read at once per site', 'The ceiling for reading one site in parallel. Helix lowers it by itself when a site pushes back.', '8'],
                ['Search results', 'The most results one search may return.', '50'],
                ['Upload size', 'The largest file you can open from your computer.', '25 MB'],
                ['Interactive sessions', 'Click-through sessions open at the same time.', '4'],
                ['Session idle time', 'How long an unused click-through session stays open.', '5 minutes'],
                ['Session lifetime', 'The longest a click-through session may run.', '15 minutes'],
                ['Shortest monitor gap', 'The least time between two checks of one monitor.', '1 hour'],
                ['Monitor history', 'Snapshots kept per monitor, and how many days of history.', '30 snapshots, 90 days'],
                ['Result retention', 'How long crawl results stay readable.', '7 days'],
                ['Allow private URLs', 'Let requests reach addresses on your own network. Off keeps them out. Turning it on asks you to confirm.', 'Off'],
              ],
            },
          },
        ],
      },
      {
        h: 'Models Helix runs by itself',
        blocks: [
          {
            p: 'Searching crawled pages by meaning uses a small text model that runs on your PC. The first time you use it, Helix downloads it as one add-on from GitHub: about 280 MB to download and about 1 GB once unpacked, into the runtime folder inside the Helix folder. After that it works without a connection. The page that asks for it answers "try again in 30 seconds" while the download runs.',
          },
        ],
      },
    ],
    next: [
      { slug: 'privacy-and-data', why: 'says what each provider and search source can see.' },
      { slug: 'help', why: 'covers search errors and the add-on download.' },
    ],
  },
  {
    slug: 'privacy-and-data',
    nav: 'Privacy and Data',
    group: 'Privacy',
    title: 'Privacy and data',
    intro:
      'Helix runs on your PC, and what it reads is saved there. This page lists what stays, what leaves and to whom, where your files live and how to delete them.',
    sections: [
      {
        h: 'The short version',
        blocks: [
          {
            ul: [
              'Results, settings and keys stay on your PC.',
              'Page text goes to an AI only when you use a feature that needs one, and only to the account you connected.',
              'There is no Helix account and no Helix server that sees your requests.',
              'Helix does not send usage statistics.',
            ],
          },
        ],
      },
      {
        h: 'What leaves your PC',
        blocks: [
          {
            table: {
              head: ['Goes to', 'What is sent', 'When'],
              rows: [
                ['The sites you ask Helix to read', 'The address you asked for, and the usual details a browser sends. The site sees your connection’s internet address.', 'Every read'],
                ['Your AI provider', 'The text Helix gives the model, such as a page and your instructions.', 'Only features that need an AI, and only for a cloud provider'],
                ['Your search source', 'The search question.', 'Only when you search'],
                ['A proxy you choose', 'Your page requests.', 'Only if you turn a proxy on'],
                ['An address you choose', 'A notice that a monitor found a change, or that a batch finished.', 'Only if you set one'],
                ['GitHub', 'A request to check for a new version, and the add-on download.', 'Each time Helix opens, and the first time you search crawled pages by meaning'],
              ],
            },
          },
          {
            p: 'A model running on your own PC, such as one served by Ollama, keeps the text on your PC.',
          },
        ],
      },
      {
        h: 'What stays on your PC, and where',
        blocks: [
          {
            p: 'Everything lives in one folder: %APPDATA%\\Helix.',
          },
          {
            table: {
              head: ['Item', 'Where', 'Notes'],
              rows: [
                ['Results, monitors and settings', 'Helix folder, data', 'A database that runs inside Helix.'],
                ['Your access keys', 'Helix folder, data', 'Stored as one-way fingerprints plus a short prefix.'],
                ['AI provider keys', 'Helix folder, data', 'Encrypted. The encryption key is derived from the app’s own access key.'],
                ['The app’s own access key', 'Helix folder, credentials.json', 'Encrypted with Windows for your user account when Windows allows it.'],
                ['Logs', 'Helix folder, logs', 'Start-up and error details for the app and its parts.'],
                ['The search add-on', 'Helix folder, runtime', 'Only if you have used searching by meaning.'],
              ],
            },
          },
          {
            note: 'Encrypted keys are protected if the database file is copied away on its own. They are not protected from other programs that run as you.',
          },
        ],
      },
      {
        h: 'Delete your data',
        blocks: [
          {
            ul: [
              'Remove a provider key: Settings, then AI Providers, then Remove key and Confirm.',
              'Revoke an access key you created: API Keys, then Revoke. The app’s own key cannot be revoked.',
              'Remove everything: quit Helix, uninstall it from Windows Settings, then delete the folder %APPDATA%\\Helix. Uninstalling alone keeps your data.',
            ],
          },
        ],
      },
      {
        h: 'This website',
        blocks: [
          {
            p: 'The Helix website has no accounts and adds no third-party trackers. The Privacy page has the short policy.',
          },
        ],
      },
    ],
    next: [
      { slug: 'settings-and-models', why: 'shows how to connect or remove an AI provider.' },
      { slug: 'help', why: 'answers common problems, including where the logs are.' },
    ],
  },
  {
    slug: 'help',
    nav: 'Help',
    group: 'Help',
    title: 'Help',
    intro: 'Common problems with a symptom, a likely cause and what to do. Start with the heading that matches what you see.',
    sections: [
      {
        h: 'Windows warns before the installer runs',
        blocks: [
          {
            p: 'The installer is not code-signed, so Windows can show a "Windows protected your PC" message. If you downloaded it from the Download page or the releases page, select More info, then Run anyway.',
          },
        ],
      },
      {
        h: 'Helix quits as soon as it opens',
        blocks: [
          {
            p: 'This can happen when you start Helix from a terminal inside some code editors. Those terminals set a variable (ELECTRON_RUN_AS_NODE) that stops apps like Helix from opening. Start Helix from the Start menu or the desktop shortcut instead, which are not affected.',
          },
        ],
      },
      {
        h: 'The start-up window says a part stopped',
        blocks: [
          {
            p: 'Select Show log to open the log, or find the logs in %APPDATA%\\Helix\\logs. Quit Helix and open it again first, since a part that was still shutting down can block the next start.',
          },
          {
            p: 'Helix uses ports 7410, 7411 and 7412 on your PC. If another program is using one, that part cannot start. Close the other program and open Helix again.',
          },
        ],
      },
      {
        h: 'Searching says no search backend is configured',
        blocks: [
          {
            p: 'Helix has no search source until you add one. Follow Set up searching in Settings and Models, then quit and reopen Helix.',
          },
        ],
      },
      {
        h: 'A page could not be read',
        blocks: [
          {
            p: 'Helix names why a read failed.',
          },
          {
            table: {
              head: ['Reason', 'What it means'],
              rows: [
                ['blocked', 'The site refused an automated visit.'],
                ['challenge', 'The site showed a "prove you are human" page.'],
                ['timeout', 'The page took too long to answer.'],
                ['dns', 'The address could not be found.'],
                ['tls', 'The secure connection could not be made.'],
                ['http_error', 'The site answered with an error.'],
                ['empty', 'The page had nothing readable on it.'],
                ['robots_denied', 'The site’s rules ask automated visitors to stay out, and Respect robots is on.'],
                ['unsupported_type', 'Helix cannot read that kind of file.'],
                ['service_unavailable', 'A part the request needs is not ready, such as an AI account, a search source or the document reader.'],
              ],
            },
          },
          {
            p: 'For blocked and challenge, try again later. Some sites cannot be read automatically at all.',
          },
        ],
      },
      {
        h: 'An AI feature says it is unavailable',
        blocks: [
          {
            p: 'Open Settings, then AI Providers, and add an account or a model on your PC. Check that the model name is one the provider offers.',
          },
        ],
      },
      {
        h: 'Searching crawled pages by meaning is slow or not ready',
        blocks: [
          {
            p: 'The first time, Helix downloads a text model of about 280 MB. Until it finishes, the request answers "try again in 30 seconds". If the download fails, Helix tries again no sooner than 5 minutes later. If it keeps failing, install the Microsoft Visual C++ Redistributable (x64) and restart Helix, since the model needs one of its files.',
          },
        ],
      },
      {
        h: 'Helix refuses an address on my own network',
        blocks: [
          {
            p: 'By default Helix will not open addresses on your own network, such as your router or a company intranet page. To allow it, turn on Allow private URLs in Settings and confirm. Only do this if you trust everyone who can use your Helix.',
          },
        ],
      },
      {
        h: 'Common questions',
        blocks: [
          {
            ul: [
              'Do I need an account? No.',
              'Does Helix work on Mac or Linux? The app is Windows only. Developers can run Helix from source with the self-host guide.',
              'How do I update? Helix checks for a new version when it opens, downloads it and installs it when you close the app. You can also run a newer installer over the old one.',
              'Where are my files? In %APPDATA%\\Helix. See Privacy and Data.',
            ],
          },
        ],
      },
    ],
    next: [
      { slug: 'quickstart', why: 'walks through install and your first result again.' },
      { slug: 'privacy-and-data', why: 'lists where each file lives and how to delete it.' },
    ],
  },
];
