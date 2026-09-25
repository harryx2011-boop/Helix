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

/** Tool counts, verified against tools.json on 2026-09-22. */
export const TOOL_TOTAL = 95;
export const TOOL_READONLY = 57;
export const TOOL_MUTATING = 38;
/**
 * Tools that change Canvas and therefore sit behind the confirm gate. This is
 * 37, not 38: `clear_cache` mutates only the local course-code cache and makes
 * no Canvas request, so the honest claim is "every tool that changes Canvas",
 * never "every mutating tool".
 */
export const TOOL_CONFIRMED = 37;
export const TOOL_DESTRUCTIVE = 12;

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
  { module: 'discussions', label: 'Discussions & announcements', count: 12, readOnly: 6, blurb: 'Read threads and replies, post entries, and manage announcements.' },
  { module: 'peer_reviews', label: 'Peer reviews', count: 12, readOnly: 9, blurb: 'Assign, chase and analyse peer review workflows across a cohort.' },
  { module: 'assignments', label: 'Assignments & grading', count: 9, readOnly: 5, blurb: 'List and update assignments, grade submissions, leave comments.' },
  { module: 'identity', label: 'Courses', count: 9, readOnly: 8, blurb: 'Resolve courses by id, code or name; read structure, syllabus and enrolments.' },
  { module: 'student', label: 'Student', count: 9, readOnly: 6, blurb: "A student's own view: what's due, grades, submissions and to-dos." },
  { module: 'modules', label: 'Modules', count: 8, readOnly: 2, blurb: 'Build and reorder modules and the items inside them.' },
  { module: 'pages', label: 'Pages', count: 7, readOnly: 2, blurb: 'Read and edit course pages, including bulk edits and the front page.' },
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
    note: 'Stdio is the default and needs no port. HTTP is for clients that cannot spawn a process. Binding past 127.0.0.1 requires CANVAS_MCP_AUTH_TOKEN -- the server refuses to start without it.',
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
  { key: 'CANVAS_MCP_AUTH_TOKEN', required: false, fallback: '—', note: 'Shared secret for the HTTP transport. Required to bind beyond localhost; irrelevant to stdio.' },
];

/**
 * The prompt a person pastes into their coding agent to stand up Canvas
 * Connect for themselves. Mirrors `lib/setup-prompt.ts`'s shape (install the
 * skill, resolve a secret without printing it, smoke-test, report back), but
 * for a locally-run stdio MCP server rather than a hosted API: there is no
 * key to mint, only a Canvas personal access token the person already holds
 * or creates on their own Canvas instance.
 */
export function canvasSetupPrompt(): string {
  return `Set up ${CANVAS_NAME} on this machine so you can read and (with confirmation) act on my Canvas LMS account through ${TOOL_TOTAL} MCP tools.

Goal:
- Clone and install ${CANVAS_PACKAGE} from the Helix monorepo and get it running as a local MCP server.
- Get it talking to my Canvas account WITHOUT printing, echoing or pasting my Canvas token into this chat.

Source:
- Repo: ${CANVAS_REPO}
- Subdirectory: ${CANVAS_SUBDIR}
- Skills (drop-in workflows): ${CANVAS_SUBDIR}/skills/*/SKILL.md — install the ones relevant to me into .claude/skills/ or .agents/skills/.

What to do:
1. Clone the repo and cd into ${CANVAS_SUBDIR}.
2. Install with uv (fallback: a plain venv + pip install -e .):
   uv venv .venv && uv pip install --python .venv/bin/python -e .
3. Copy .env.example to .env inside that directory.
4. Check whether CANVAS_URL and CANVAS_TOKEN are already available FROM YOUR OWN SHELL, never by asking me to echo them:
   printf '%s\\n' "\${CANVAS_URL:+url-set}" "\${CANVAS_TOKEN:+token-set}"; [ -s .env ] && grep -lq CANVAS_TOKEN .env && printf 'env-file-set\\n'
   Your shell is probably non-interactive and skips ~/.zshrc and ~/.bashrc, so a value set there can look present to me and empty to you. If nothing shows, tell me which file to put it in; do not open profile or shell config files.
5. Only if no token resolves, ask me for my Canvas URL (e.g. https://schoolname.instructure.com) and a personal access token I mint from my own Canvas account under Settings → Approved Integrations → New Access Token, and to write both into .env in ${CANVAS_SUBDIR}. Wait for me to confirm before continuing.
6. Verify the install without ever printing the token:
   .venv/bin/canvaslms-api --test
   (Windows: .venv\\Scripts\\canvaslms-api.exe --test)
   Expect a success line naming my Canvas account. A connection error means the URL or token is wrong; read the failure reason before retrying.
7. Wire the MCP server into this agent as ${CANVAS_PACKAGE}, pointed at the venv's canvaslms-api executable, stdio transport (see ${CANVAS_SUBDIR}/README.md for exact client config).
8. Tell me how to restart or rescan this agent so it discovers the server.

Hard rule throughout: the token is a secret and my Canvas account's permissions are exactly what my role grants — never widen them. Inspect the token only through a presence check, and Canvas responses only through their status/summary, never a raw dump of grades or personal data unless I ask for it. Every tool that changes Canvas takes a confirm argument — call it once without confirm to show me the preview, and never pass confirm=true without my explicit go-ahead in this chat. If the token is ever exposed, tell me to revoke it in Canvas and mint a new one.`;
}
