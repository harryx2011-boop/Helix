#!/usr/bin/env node
import { flagSet, flagValue, flagValues, parseArgs } from './args.js';
import { DEFAULT_MCP_URL, DEFAULT_SITE_URL, runInit } from './init.js';

const VERSION = '0.1.0';

const HELP = `helix ${VERSION}

Connect an agent harness to Helix, a frontier utility hub.

Usage
  helix init --all -k <key>          configure every detected harness
  helix init --client cursor -k <key> configure one harness (repeatable)
  helix init --browser                open the connect page instead of passing a key

Options
  -k, --key <key>       Helix API key (helix-…); or HELIX_API_KEY
  --all                 write config for every detected harness
  --client <id>         claude-code | cursor | codex | windsurf
  --browser             open the app's connect page and exit
  --mcp-url <url>       MCP endpoint (default ${DEFAULT_MCP_URL}; or HELIX_MCP_URL)
  --site-url <url>      app URL used to fetch SKILL.md (default ${DEFAULT_SITE_URL}; or HELIX_SITE_URL)
  --no-skill            write MCP config only
  --dry-run             print what would be written
  -h, --help            show this help
  -v, --version         print the version

Writes
  Claude Code  ~/.claude.json                       ~/.claude/skills/helix/SKILL.md
  Cursor       ~/.cursor/mcp.json                   ~/.cursor/skills/helix/SKILL.md
  Codex        ~/.codex/config.toml                 ~/.codex/skills/helix/SKILL.md
  Windsurf     ~/.codeium/windsurf/mcp_config.json  ~/.codeium/windsurf/skills/helix/SKILL.md
`;

const VALUED = new Set(['key', 'client', 'mcp-url', 'site-url']);

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv, VALUED);
  } catch (error) {
    console.error(`helix: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  if (flagSet(parsed, 'version')) {
    console.log(VERSION);
    return 0;
  }

  const command = parsed.positional[0];
  if (!command || flagSet(parsed, 'help')) {
    console.log(HELP);
    return command || flagSet(parsed, 'help') ? 0 : 1;
  }

  if (command !== 'init') {
    console.error(`helix: unknown command "${command}". v0.1 ships \`init\` only; \`helix scrape\` and friends are deferred.`);
    console.error(HELP);
    return 2;
  }

  try {
    const result = await runInit({
      apiKey: flagValue(parsed, 'key') ?? process.env['HELIX_API_KEY'],
      all: flagSet(parsed, 'all'),
      clients: flagValues(parsed, 'client'),
      browser: flagSet(parsed, 'browser'),
      mcpUrl: flagValue(parsed, 'mcp-url') ?? process.env['HELIX_MCP_URL'] ?? DEFAULT_MCP_URL,
      siteUrl: flagValue(parsed, 'site-url') ?? process.env['HELIX_SITE_URL'] ?? DEFAULT_SITE_URL,
      skill: !flagSet(parsed, 'no-skill'),
      dryRun: flagSet(parsed, 'dry-run'),
      log: (line) => console.log(line),
    });
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
    if (result.harnesses.length > 0) {
      console.log(`\nDone. Restart ${result.harnesses.map((h) => h.id).join(', ')} to pick up the "helix" MCP server.`);
    }
    return 0;
  } catch (error) {
    console.error(`helix: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2));
}
