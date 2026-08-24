# @helix/cli

Connects an agent harness to a Helix instance. v0.1 is a connector only: it writes MCP configuration and your SKILL.md, and nothing else. `helix scrape <url>` and friends are deferred.

```
npx -y @helix/cli@latest init --all -k helix-…
```

Not yet published to npm. From this repo:

```
pnpm --filter @helix/cli build
node packages/cli/dist/bin.js init --all -k helix-…
```

## What `init` writes

| Harness | Detected by | MCP config | SKILL.md |
|---|---|---|---|
| Claude Code | `~/.claude/` or `~/.claude.json` | `~/.claude.json` → `mcpServers.helix` | `~/.claude/skills/helix/SKILL.md` |
| Cursor | `~/.cursor/` | `~/.cursor/mcp.json` → `mcpServers.helix` | `~/.cursor/skills/helix/SKILL.md` |
| Codex | `~/.codex/` | `~/.codex/config.toml` → `[mcp_servers.helix]` | `~/.codex/skills/helix/SKILL.md` |
| Windsurf | `~/.codeium/windsurf/` | `~/.codeium/windsurf/mcp_config.json` → `mcpServers.helix` | `~/.codeium/windsurf/skills/helix/SKILL.md` |

Existing entries in each file are preserved; only the `helix` entry is replaced.

## Flags

```
helix init [--all | --client <id>...] -k <key> [--mcp-url <url>] [--site-url <url>] [--no-skill] [--dry-run]
helix init --browser
```

`--browser` opens the connect page in the app instead of taking a key. `HELIX_API_KEY`, `HELIX_MCP_URL` and `HELIX_SITE_URL` are read when the flags are absent.
