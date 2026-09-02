import { MCP_URL, PUBLIC_API_URL, SITE_URL } from './mode';

export const SKILL_MD_PATH = '/agent-onboarding/SKILL.md';

/**
 * The prompt a person pastes into their coding agent to wire Helix into the
 * current project. Written for the agent, not the person: it installs the
 * skill first, checks for a key without ever printing one, smoke-tests with a
 * status code, and asks the person for the one thing only they can provide.
 * (research/18-exa.md: the shape Exa's agent-skill pages use, in Helix's terms.)
 */
export function setupPrompt(): string {
  const skillUrl = `${SITE_URL}${SKILL_MD_PATH}`;
  return `Set up Helix on this machine so you can fetch, parse, search, crawl, interact with and monitor the live web through its API.

Goal:
- Install the Helix skill so you know the base URL, every request shape, the response envelope and the failure reasons.
- Get a Helix API key working WITHOUT printing, echoing or pasting the key into this chat.

Skill source:
- SKILL.md URL: ${skillUrl}
- Install directories: .claude/skills/helix (Claude Code, project) or ~/.claude/skills/helix (global); .agents/skills/helix or ~/.agents/skills/helix (Codex, Cursor and other Agent-Skills tools).

What to do:
1. Install the skill FIRST. Prefer the project-local directory when working inside a repo, otherwise the global one:
   mkdir -p <skills-dir>/helix && curl -fsSL "${skillUrl}" -o <skills-dir>/helix/SKILL.md
   Then confirm the file exists and read it.
2. Check whether a key is already available FROM YOUR OWN SHELL, never by asking me to echo it:
   printf '%s\\n' "\${HELIX_API_KEY:+env-set}"; [ -s .env.local ] && grep -lq HELIX_API_KEY .env.local && printf 'env-file-set\\n'
   Your shell is probably non-interactive and skips ~/.zshrc and ~/.bashrc, so a key set there can look present to me and empty to you. If nothing shows, tell me which file to put it in; do not open profile files.
3. Only if no key resolves, ask me to create one at ${SITE_URL}/app/keys (or on the Helix instance with POST /v1/keys) and to export HELIX_API_KEY in my own terminal or write it to .env.local. Wait for me to confirm before continuing.
4. Smoke-test from your own shell and print only the status code:
   curl -s -o /dev/null -w "%{http_code}\\n" -X POST ${PUBLIC_API_URL}/v1/scrape \\
     -H "Authorization: Bearer $HELIX_API_KEY" -H "Content-Type: application/json" \\
     -d '{"url":"https://example.com","formats":["markdown"]}'
   Expect 200. A 401 means the key is wrong; a 200 with {"success": false} in the body is a fetch failure, not an auth failure. Read the failure reason before retrying.
5. Optional: wire the MCP server so the tools appear natively. Transport http, URL ${MCP_URL}, header "Authorization: Bearer $HELIX_API_KEY". Or run: npx -y @helix/cli@latest init --all -k "$HELIX_API_KEY"
6. Tell me how to restart or rescan this agent so it discovers the skill.

Hard rule throughout: the key is a secret. Inspect it only through a presence check or an HTTP status code. Never print, echo, cat or grep-with-output a file or variable that may hold it. If it is ever exposed, tell me to revoke it and mint a new one.`;
}
