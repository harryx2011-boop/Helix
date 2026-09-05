/**
 * The Canvas Connect catalog: the single source of truth for the `/canvas`
 * routes, mirroring what `lib/catalog.ts` does for the endpoint products.
 *
 * Counts here are derived from the server's own `list_tools()` dump, carried
 * across as `public/canvas/tools.json`. When the server gains or loses a tool,
 * regenerate that file and update `TOOL_TOTAL` / `CANVAS_MODULES` from it
 * rather than editing either by hand.
 *
 * Naming (CANVAS-MERGE.md): the product is "Canvas Connect" in titles and
 * prose, "Canvas" as a nav label, and `canvaslms-api` wherever a command,
 * package or config key is shown.
 */

export const CANVAS_NAME = 'Canvas Connect';
export const CANVAS_PACKAGE = 'canvaslms-api';
/**
 * The server lives in the Helix monorepo at `tools/canvas-mcp`. The standalone
 * CanvasLMS-API repo was retired on merge, so a clone lands in Helix and the
 * install steps cd into that subdirectory.
 */
export const CANVAS_REPO = 'https://github.com/harryx2011-boop/Helix.git';
export const CANVAS_SUBDIR = 'Helix/tools/canvas-mcp';

/** Tool counts, verified against tools.json on 2026-09-05. */
export const TOOL_TOTAL = 100;
export const TOOL_READONLY = 60;
export const TOOL_MUTATING = 40;
/**
 * Tools that change Canvas and therefore sit behind the confirm gate. This is
 * 39, not 40: `clear_cache` mutates only the local course-code cache and makes
 * no Canvas request, so the honest claim is "every tool that changes Canvas",
 * never "every mutating tool".
 */
export const TOOL_CONFIRMED = 39;
export const TOOL_DESTRUCTIVE = 14;

export interface CanvasModule {
  /** Server module name, matching the `module` field in tools.json. */
  module: string;
  /** Human group label, matching the `group` field. */
  label: string;
  count: number;
  readOnly: number;
  blurb: string;
}

/** The fourteen tool modules, largest first. */
export const CANVAS_MODULES: readonly CanvasModule[] = [
  { module: 'discussions', label: 'Discussions & announcements', count: 14, readOnly: 6, blurb: 'Read threads and replies, post entries, and manage announcements.' },
  { module: 'peer_reviews', label: 'Peer reviews', count: 13, readOnly: 10, blurb: 'Assign, chase and analyse peer review workflows across a cohort.' },
  { module: 'assignments', label: 'Assignments & grading', count: 9, readOnly: 5, blurb: 'List and update assignments, grade submissions, leave comments.' },
  { module: 'pages', label: 'Pages', count: 9, readOnly: 4, blurb: 'Read and edit course pages, including bulk edits and the front page.' },
  { module: 'identity', label: 'Courses', count: 9, readOnly: 8, blurb: 'Resolve courses by id, code or name; read structure, syllabus and enrolments.' },
  { module: 'student', label: 'Student', count: 9, readOnly: 6, blurb: "A student's own view: what's due, grades, submissions and to-dos." },
  { module: 'modules', label: 'Modules', count: 8, readOnly: 2, blurb: 'Build and reorder modules and the items inside them.' },
  { module: 'rubrics', label: 'Rubrics', count: 6, readOnly: 3, blurb: 'Create rubrics, associate them, and grade against their criteria.' },
  { module: 'messaging', label: 'Messaging', count: 6, readOnly: 3, blurb: 'Canvas Inbox: read conversations and send individual or bulk messages.' },
  { module: 'people', label: 'People & privacy', count: 5, readOnly: 4, blurb: 'List users, check enrolments, and control student anonymisation.' },
  { module: 'accessibility', label: 'Accessibility', count: 5, readOnly: 4, blurb: 'Scan course content for accessibility violations and fix what is mechanical.' },
  { module: 'files', label: 'Files', count: 4, readOnly: 3, blurb: 'List, read, download and upload course files.' },
  { module: 'migrations', label: 'Course copy', count: 2, readOnly: 1, blurb: 'Copy content between courses and follow the migration to completion.' },
  { module: 'developer', label: 'Meta', count: 1, readOnly: 1, blurb: 'Search the tool catalog itself.' },
];

export type CanvasOS = 'windows' | 'macos' | 'linux';

export const OS_LABEL: Record<CanvasOS, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

/** Install steps per OS, carried across verbatim from the server's own docs. */
export const INSTALL_STEPS: Record<CanvasOS, readonly { title: string; code: string }[]> = {
  windows: [
    { title: 'clone', code: `git clone ${CANVAS_REPO}\ncd ${CANVAS_SUBDIR}` },
    { title: 'install (uv)', code: 'uv venv .venv\nuv pip install --python .venv\\Scripts\\python.exe -e .' },
    { title: 'env file', code: 'copy .env.example .env' },
    { title: 'verify', code: '.venv\\Scripts\\canvaslms-api.exe --test' },
  ],
  macos: [
    { title: 'clone', code: `git clone ${CANVAS_REPO}\ncd ${CANVAS_SUBDIR}` },
    { title: 'install (uv)', code: 'uv venv .venv\nuv pip install -e .' },
    { title: 'env file', code: 'cp .env.example .env' },
    { title: 'verify', code: '.venv/bin/canvaslms-api --test' },
  ],
  linux: [
    { title: 'clone', code: `git clone ${CANVAS_REPO}\ncd ${CANVAS_SUBDIR}` },
    { title: 'install (uv)', code: 'uv venv .venv\nuv pip install -e .' },
    { title: 'env file', code: 'cp .env.example .env' },
    { title: 'verify', code: '.venv/bin/canvaslms-api --test' },
  ],
};

const WIN_BIN = 'C:\\path\\to\\Helix\\tools\\canvas-mcp\\.venv\\Scripts\\canvaslms-api.exe';
const NIX_BIN = '/path/to/Helix/tools/canvas-mcp/.venv/bin/canvaslms-api';

export interface CanvasClientDef {
  id: string;
  label: string;
  /** How this client is pointed at the server, once it is installed. */
  steps: readonly { title: string; code: string }[];
  note?: string;
}

/**
 * The server reads `.env` from its own folder, so no client config carries the
 * Canvas token. That is worth stating on every tab: it is the difference
 * between a config file with a secret in it and one without.
 */
export const CANVAS_CLIENTS: readonly CanvasClientDef[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    steps: [
      { title: 'Windows', code: `claude mcp add --scope user ${CANVAS_PACKAGE} -- "${WIN_BIN}"` },
      { title: 'macOS / Linux', code: `claude mcp add --scope user ${CANVAS_PACKAGE} -- "${NIX_BIN}"` },
    ],
    note: 'Restart Claude Code — servers load at session start — then check /mcp.',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    steps: [
      {
        title: '%APPDATA%\\Claude\\claude_desktop_config.json',
        code: `{\n  "mcpServers": {\n    "${CANVAS_PACKAGE}": {\n      "command": "${WIN_BIN}"\n    }\n  }\n}`,
      },
      {
        title: '~/Library/Application Support/Claude/claude_desktop_config.json',
        code: `{\n  "mcpServers": {\n    "${CANVAS_PACKAGE}": {\n      "command": "${NIX_BIN}"\n    }\n  }\n}`,
      },
    ],
    note: 'Restart Claude Desktop after editing the file.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    steps: [
      {
        title: '.cursor/mcp.json',
        code: `{\n  "mcpServers": {\n    "${CANVAS_PACKAGE}": {\n      "command": "${NIX_BIN}"\n    }\n  }\n}`,
      },
    ],
  },
  {
    id: 'http',
    label: 'HTTP',
    steps: [{ title: 'run over HTTP instead of stdio', code: 'canvaslms-api --transport http --host 127.0.0.1 --port 7100' }],
    note: 'Stdio is the default and needs no port. HTTP is for clients that cannot spawn a process.',
  },
];

/** Config keys read from `.env`, with the two that are required first. */
export const CANVAS_ENV: readonly { key: string; required: boolean; fallback: string; note: string }[] = [
  { key: 'CANVAS_URL', required: true, fallback: '—', note: 'Must start with https://. A trailing /api/v1 is stripped.' },
  { key: 'CANVAS_TOKEN', required: true, fallback: '—', note: 'A Canvas personal access token. Never leaves the machine.' },
  { key: 'CANVAS_TIMEOUT', required: false, fallback: '30', note: 'Seconds. Slow tools override this per call.' },
  { key: 'CANVAS_CACHE_TTL', required: false, fallback: '300', note: 'Course-resolution cache lifetime, in seconds.' },
  { key: 'CANVAS_MAX_CONCURRENCY', required: false, fallback: '5', note: 'Parallel requests against Canvas.' },
  { key: 'CANVAS_ANONYMIZE_STUDENTS', required: false, fallback: 'false', note: 'Replaces names with stable pseudonyms in every output.' },
  { key: 'CANVAS_DOWNLOAD_DIR', required: false, fallback: 'system temp', note: 'Where downloaded course files land.' },
];
