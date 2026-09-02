# 18 — Exa (exa.ai): agent-facing search, contrast research

Web-only research. No Helix code changed. Purpose: understand how Exa designs search/retrieval for AI agents, and what — if anything — Helix's six-API surface should borrow. Cross-referenced against `WEBSITE.md` §11 "Claims guard" (no benchmarks/latencies/"faster than" claims in Helix copy) and Helix's existing agent-onboarding mechanism (`apps/dashboard/components/marketing/setup-guides.tsx`, `apps/dashboard/lib/skill.ts`).

---

## 1. What Exa is

Exa (exa.ai) is a search-and-retrieval API company positioned explicitly as infrastructure for AI agents rather than a human-facing search engine. Its own framing: "The world's data for AI agents" — "Search the largest index of public web and private information" ([exa.ai](https://exa.ai), fetched 2026-09-02). The product line spans **Search** (neural/keyword/auto/fast/deep modes), **Contents** (text/highlights/summary extraction with `livecrawl`/`maxAgeHours` freshness controls), **Answer** (search + LLM synthesis with citations), an **Agent API** (multi-step research, list-building, enrichment), **Websets** (verified, enriched, asynchronous web datasets — described in current docs as a legacy surface, with new collection-building work steered toward the Agent API), and **Monitors** (scheduled recurring searches/websets). Exa ships SDKs (`exa-py`, `exa-js`), a hosted **MCP server** (`https://mcp.exa.ai/mcp`), and a set of portable **Agent Skills** (SKILL.md files) for Claude Code, Codex, Cursor, and "any Agent-Skills-compatible agent" ([github.com/exa-labs/agent-skills](https://raw.githubusercontent.com/exa-labs/agent-skills/main/README.md), fetched 2026-09-02). The company raised a $250M Series C in May 2026 at a $2.2B valuation explicitly to "power all agents with the highest quality web search," projecting that "the number of searches from LLMs will be 1000x more than Google searches today" ([exa.ai/blog/announcing-series-c](https://exa.ai/blog/announcing-series-c), fetched 2026-09-02).

---

## 2. Principles Exa states or embodies for agent-facing search

### Return content, not links

Exa's core positioning is that an agent cannot click through ten blue links — it needs the page's substance in the same response as the ranking. The Contents API returns `text`, `highlights` (query-guided snippets), and `summary` (LLM-generated overview) alongside every result, and the `build-with-exa` skill tells agents: "The recommended Exa search request is the query plus token-efficient content extraction, and nothing else... omit `contents` and results carry only metadata (title, URL, dates), no page content" ([raw SKILL.md](https://raw.githubusercontent.com/exa-labs/agent-skills/main/skills/build-with-exa/SKILL.md), fetched 2026-09-02). Highlights are marketed as "10x token efficient extracts of only the relevant tokens from a webpage" (docs getting-started page, fetched 2026-09-02 via WebFetch summary — wording paraphrased by the fetch tool, treat as approximate/unverified verbatim).

### Neural/embedding retrieval, with `auto` to pick for you

The `type` parameter on `/search` exposes multiple retrieval strategies. Per the live docs (`exa.ai/docs/reference/search`, fetched 2026-09-02): `auto` is "a balanced mode that optimizes for both quality and speed" and is the default; `instant` is "optimized for minimum response time, trading some search depth for speed"; `fast` "returns high-quality results with reduced latency"; `deep-lite`, `deep`, and `deep-reasoning` trade latency for "comprehensive multi-step research with synthesis" up to "stronger reasoning for complex analysis." Note: current live docs describe this as a **speed/depth spectrum** (`instant → fast → auto → deep-lite → deep → deep-reasoning`), not a `neural vs. keyword` binary as older Exa material used to frame it — the getting-started page fetched today states "the documentation doesn't explicitly contrast 'neural vs keyword' approaches; it emphasizes speed-quality tradeoffs across search types," so the historical neural/keyword dichotomy appears to have been superseded or absorbed into `auto`. Treat the neural-vs-keyword framing as **legacy positioning**, not current API surface — unverified whether `keyword`-only mode still exists as a `type` value.

### Controllable cost/latency via named tiers

Rather than one endpoint with a hidden cost model, Exa exposes named latency tiers a caller opts into per-request: `instant` (~250ms), `fast` (~450ms), `auto` (~1s default), `deep-lite` (~4s), `deep` (4–15s), `deep-reasoning` (12–40s) (`exa.ai/docs/reference/getting-started`, fetched 2026-09-02). This makes the speed/quality/cost tradeoff an explicit, named parameter rather than an implicit backend decision — the caller picks the tier that matches whether it's a chat autocomplete or a background research job.

### Freshness as a parameter, not a fixed crawl cadence

`maxAgeHours` "controls content freshness; 0 fetches fresh content, -1 uses cache exclusively" (`exa.ai/docs/reference/search`, fetched 2026-09-02). The `build-with-exa` skill clarifies scope: "`maxAgeHours` should be set only when extracted page content must be current. It caps cache age before a live crawl; it is not a publication-recency filter" (raw SKILL.md, fetched 2026-09-02) — i.e., freshness (how recently was the page *fetched*) is kept conceptually distinct from recency (`startPublishedDate`/`endPublishedDate`, when the page was *published*).

### `findSimilar` — search by URL instead of query

Exa exposes URL-based similarity search as a first-class endpoint (referenced throughout the docs index and MCP tool descriptions) — given a URL, return pages like it, rather than requiring the caller to reverse-engineer a text query that captures "more like this." **Unverified in this pass**: I could not successfully fetch `exa.ai/docs/reference/findsimilar` directly (404 on the guessed path); its exact parameter list is not confirmed here and should be treated as a known Exa capability by reputation/docs-index listing only, not independently verified content.

### Category and domain filters as blunt instruments, gated by need

`category` restricts results to `company`, `publication`, `news`, `personal site`, `financial report`, or `people`, with the docs noting "the `people` and `company` categories have improved quality for finding people profiles and company pages" (`exa.ai/docs/reference/search`, fetched 2026-09-02). `includeDomains`/`excludeDomains` support up to 1200 entries each. Notably, the `build-with-exa` skill actively discourages over-using these: "Omit `category`. Use it only when the user explicitly asks for category-constrained retrieval," and domain filters "should be set only when the user explicitly requests a hard allowlist or blocklist... Express source preferences through query phrasing... instead" (raw SKILL.md, fetched 2026-09-02). This is a deliberate anti-over-engineering stance baked into the agent-facing skill itself, not just the API docs.

### `answer` and `agent` as agentic, multi-step endpoints layered on search

`/answer` "performs a search based on the query and generates either a direct answer or a detailed summary with citations, depending on the query type," selectable across four model variants (`exa`, `exa-pro`, `exa-research`, `exa-fast`), with citations carrying title/URL/published-date/author metadata and optional full source text (`exa.ai/docs/reference/answer`, fetched 2026-09-02). The Agent API sits a layer above this for "multi-step research, list-building, enrichment, and structured output" (MCP server tool description, fetched 2026-09-02) — i.e., Exa ships increasingly agentic endpoints (search → answer → agent) rather than one endpoint with escalating flags.

### Websets — verified, enriched, asynchronous collections

Websets performs four-stage retrieval: query definition (natural language + criteria), search & verification ("each result is checked against rules you define"), automatic enrichment (extracting structured fields like funding amounts or contact details), and asynchronous delivery via polling/webhooks/dashboard (`exa.ai/docs/websets/overview`, fetched 2026-09-02, note: URL guessed, may not be the canonical path — treat structure as directionally accurate but unverified against the exact current page). The `build-with-exa` skill's scope note calls Websets a "legacy surface (existing integrations only; new collection-building work uses the Agent API)" — Exa appears to be consolidating this capability into the Agent API rather than growing it as a separate product (raw SKILL.md, fetched 2026-09-02).

### Zero Data Retention as a stated boundary on some endpoints, not all

The `build-with-exa` skill states plainly: "`/search`, `/answer`, and `/agent/` offer Zero Data Retention (ZDR). Websets and Monitors are not ZDR. If a use case requires ZDR, stay on the ZDR surfaces or contact Exa" (raw SKILL.md, fetched 2026-09-02). This is a concrete, checkable data-handling claim scoped per-endpoint rather than a blanket privacy statement.

### MCP tool naming: broad-then-narrow, gated behind opt-in flags

The hosted MCP server (`https://mcp.exa.ai/mcp`) ships two tools enabled by default and two gated behind URL query parameters:

- `web_search_exa` — "Search the web for any topic and get clean, ready-to-use content" (default on)
- `web_fetch_exa` — "Read a webpage's full content as clean markdown from one or more URLs" (default on)
- `web_search_advanced_exa` — "Advanced search with filters, domains, dates, highlights, summaries, and subpage crawling" (opt-in via `?tools=web_search_advanced_exa`)
- `agent_run` — "Run an Exa Agent for multi-step research, list-building, enrichment, and structured output" (opt-in)

(github.com/exa-labs/exa-mcp-server README and `exa.ai/docs/reference/exa-mcp`, fetched 2026-09-02.) The naming pattern suffixes every tool with `_exa` (namespacing against other MCP servers a client might have loaded) and deliberately keeps the default surface to two simple, low-cognitive-load tools, with power-user tools requiring explicit enablement — a "simple by default, capable on request" tool-count discipline.

### Evaluation: Exa publishes benchmark and speed claims freely — direct contrast with Helix's rule

Exa's public material is dense with the kind of claims Helix's Claims Guard explicitly forbids: "Exa Instant returns results in under 180ms, faster than any other search provider" (exa.ai homepage claim, fetched via WebFetch summary 2026-09-02); "The fastest search API in the world (sub200ms)"; "reduce LLM token counts by over 20x" (Series C post); blog posts titled "Search that's >20x better than Google for complex queries," "State of the art web search API," and "Introducing Exa's People Search Benchmarks" (exa.ai/blog, fetched 2026-09-02). Exa also names specific third-party benchmarks it claims to lead on (FRAMES, Tip-of-Tongue, Seal0 — per WebFetch summary, unverified against the primary benchmark page directly). **This is presented here strictly for contrast, not as a model to copy** — Helix's `WEBSITE.md` §11 Claims Guard explicitly bars "benchmarks, latencies as measurements, coverage percentages, or 'faster than' claims," "no 'beats Cloudflare' or stealth-success claims," and requires stealth be "validated only against local suites." Exa's approach is the mirror image of Helix's chosen positioning, and the gap is a deliberate Helix decision, not an oversight.

---

## 3. The setup-prompt widget

**Location found:** The widget described in the task (a per-skill "Copy setup prompt" affordance) exists, but **not** as an "Open in: Claude Code / Codex / Cursor / View SKILL.md" dropdown menu. It lives on Exa's **Agent Skills** pages, not the API quickstart:

- Index: `https://exa.ai/docs/reference/agent-skills` — lists five skills, each with its own page: `build-with-exa`, `company-research`, `lead-generation`, `exa-search`, `exa-contents`.
- Page fetched and inspected via raw HTML source: **`https://exa.ai/docs/reference/agent-skills/build-with-exa`** (fetched 2026-09-02; confirmed live, HTTP 200, 369,686 bytes of server-rendered HTML retrieved with `curl`).

**What the widget actually is** (verified against the raw HTML/React source embedded in the page, not a WebFetch summary):

The page renders via Mintlify (Next.js), and the relevant component is a `CodeBlock` whose `filename` prop — rendered as the block's header label — is literally:

> `"Copy this setup prompt into your agent"`

confirmed twice in the raw markup as `title="Copy this setup prompt into your agent"` and again in the compiled MDX source as `_jsx(CodeBlock,{filename:\`Copy this setup prompt into your agent\`,numberOfLines:\`32\`,language:\`text\`, ...})`. The paragraph immediately preceding it reads: "Or copy this prompt into your coding agent. It installs the skill, checks for an API key without printing it, and smoke-tests the key:"

**There is no "Open in" dropdown, no `claude://` URL, no `cursor://anysphere.cursor-deeplink/...` install link, and no `codex:` scheme anywhere on this page.** I grepped the raw HTML directly for `Open in`, `Install in`, `Add to Claude`, `cursor-deeplink`, `vscode:`, `claude.ai/install`, and `deeplink` — every one returned zero matches. This is a single-widget page: one copyable text block, plus two plain links below it ("View source" → raw GitHub SKILL.md; "Skills repository" → the GitHub repo). **The task's premise of a menu with per-tool deep-link options does not match what is actually on `docs.exa.ai` as of this fetch** — I'm flagging this as verified-absent rather than approximating a menu that isn't there.

**The three "logo" URLs found on the page** are not Claude/Cursor/Codex marks — they are Exa's own nav logo, used for light/dark theme switching:
- `https://mintcdn.com/exa-52/rjfwhV9stZF3dXkq/logo/light.svg` (nav logo, light theme, `alt="light logo"`)
- `https://mintcdn.com/exa-52/rjfwhV9stZF3dXkq/logo/dark.svg` (nav logo, dark theme, `alt="dark logo"`)
- The same `logo/light.svg` URL recurs in the page's JSON-LD `Organization` schema as Exa's canonical logo.

No Claude, Cursor, or Codex product marks appear anywhere in the fetched HTML (`<img>` tags with `src` containing `.svg`/`.png` were enumerated; none reference those brands). If Exa does show per-tool icons anywhere (e.g. client-side-only rendering not present in the initial HTML payload, or a different page such as the MCP install page), it was not observed in this fetch and should be treated as unverified.

**Full text of "Copy this setup prompt into your agent"** for `build-with-exa`, quoted verbatim from the rendered `<pre><code>` block (32 lines; HTML entities decoded, em-dash preserved as it appears in source):

```
Set up the Exa build-with-exa agent skill on this machine.

Goal:
- Install the build-with-exa skill so my coding agent can use it to build applications and agents with Exa's full API platform.
- Get an Exa API key working WITHOUT ever exposing, printing, or pasting the key into this chat.

Selected agent:
- Claude Code, Codex, Cursor, or any Agent-Skills-compatible agent
- Global install directories: ~/.claude/skills (Claude Code), ~/.codex/skills (Codex), ~/.agents/skills (Cursor / other)
- Project-local install directories: .claude/skills (Claude Code), .agents/skills (Codex / Cursor / other)

Skill source:
- SKILL.md URL: https://raw.githubusercontent.com/exa-labs/agent-skills/main/skills/build-with-exa/SKILL.md

What to do:
1. Install the skill FIRST, before any key setup. Prefer a project-local install when working inside a repo; otherwise use the matching global directory listed above. Create the chosen skills directory and download the skill:
   mkdir -p <skills-dir>/build-with-exa && curl -fsSL "https://raw.githubusercontent.com/exa-labs/agent-skills/main/skills/build-with-exa/SKILL.md" -o <skills-dir>/build-with-exa/SKILL.md
   Then verify that <skills-dir>/build-with-exa/SKILL.md exists.
2. Check whether an Exa API key is already available FROM YOUR OWN COMMAND-RUNNING ENVIRONMENT — use the same tool/shell you will run the skill with, not by asking me to echo it. The skill resolves the key from EXA_API_KEY first, then from the file ~/.config/exa/key, so check both without ever printing a value:
   printf '%s\n' "${EXA_API_KEY:+env-set}"; [ -s ~/.config/exa/key ] && printf 'file-set\n'
   Your shell is likely non-interactive and does NOT auto-source interactive profiles like ~/.zshrc or ~/.bashrc, so a key I set there can look present to me but empty to you. If neither shows, the key may still live in an interactive profile your shell skips: find which file WITHOUT printing its value using `grep -l EXA_API_KEY ~/.zshrc ~/.zshenv ~/.bashrc ~/.profile ~/.config/fish/config.fish 2>/dev/null` (lists names only — NEVER run a plain `grep`/`cat`/`echo` on a profile, since an `export EXA_API_KEY=...` line would leak the secret into our chat). Then `source` that file inside your command and re-run the presence test above; if it shows, prepend that same `source ...;` to every later command that needs the key.
3. Only if no key is resolvable anywhere, set one up WITHOUT hand-editing any shell profile and WITHOUT pasting the key into this chat. Tell me to create/copy a key at https://dashboard.exa.ai/api-keys, then in my own terminal either export EXA_API_KEY myself or write it to ~/.config/exa/key with mode 600 — never ask me to paste the key into chat. Then wait for me to confirm it is done before continuing.
4. Smoke-test the key from your own shell — resolve it from the env var or the file, and print only the status code:
   KEY="${EXA_API_KEY:-$(cat ~/.config/exa/key 2>/dev/null)}"
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.exa.ai/search \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"query":"exa.ai","numResults":1}'
   Keep the endpoint, headers, and body exactly as written (do not guess the schema). It must return 200, not 401/429. If you needed a `source ...;` prefix in step 2 to see an env key, prepend that here too.
5. Tell me how to restart or rescan my agent so it discovers the skill.

Hard rule throughout: the key is a secret. Only ever inspect it via a presence/length check (`${EXA_API_KEY:+set}`, `[ -s ~/.config/exa/key ]`) or an HTTP status code — never print, `echo`, `cat`, or `grep`-with-output any file or variable that may contain it, and never try to "redact" a key file with a regex. If a key is ever exposed, tell me to rotate it at https://dashboard.exa.ai/api-keys.
```

This is byte-for-byte the copy target — confirmed against the raw `<span class="line">` elements in the HTML, not a paraphrase.

**Below the prompt**, the page has two `Card` links (from the compiled MDX): "View source" → `href: https://raw.githubusercontent.com/exa-labs/agent-skills/main/skills/build-with-exa/SKILL.md` ("Read the build-with-exa skill definition before installing."), and under "Related": "All agent skills" → `/reference/agent-skills`, and "Skills repository" → `https://github.com/exa-labs/agent-skills` ("Source for every skill, including raw `SKILL.md` files.").

**Alternative install path documented on the same page/index:** `npx skills add exa-labs/agent-skills --skill "build-with-exa"` (installs via the third-party `skills.sh` / `npx skills` CLI rather than the copy-paste prompt) and `npx skills add exa-labs/agent-skills` (installs all five skills at once) — from `README.md` at `github.com/exa-labs/agent-skills` and the agent-skills index page.

---

## 4. What Helix already does that maps, and what to adopt

Helix's current agent-onboarding surface (`apps/dashboard/lib/skill.ts`, `apps/dashboard/components/marketing/setup-guides.tsx`) generates one `SKILL.md` per selected-endpoint-set on demand (`generateSkillMarkdown`), served at `/agent-onboarding/SKILL.md`, fetched via `curl -s https://helix.dev/agent-onboarding/SKILL.md`. It already has: a preamble with base URL, auth header, envelope shape, rate-limit headers, and `estimate: true`; per-endpoint "Reach for this when" / "Not when" guidance; failure-reason tables; and lifecycle notes for async endpoints (crawl, monitor, interact sessions). This is structurally close to what Exa's `build-with-exa` SKILL.md does (scope, install, auth, gated-parameter guidance) — Helix is not behind on the *content* of agent onboarding, only on a couple of specific mechanics Exa has and Helix doesn't.

1. **`docs/copy`** — Add a literal "Copy this setup prompt into your agent" affordance next to the existing "Agent onboarding" panel in `setup-guides.tsx` (currently just a cURL snippet + "View the skill" link, lines 173–192). The prompt would tell the agent's own shell to `curl` `/agent-onboarding/SKILL.md` into the right per-tool directory (`~/.claude/skills/helix/`, `.agents/skills/helix/` etc.), check for an existing `HELIX_API_KEY` without printing it, and smoke-test with a cheap call. *Why:* Exa's prompt works because it hands the *agent* (not the human) an explicit, safe, step-by-step script — Helix's current panel only hands a human a curl command and a link; an agent reading the marketing page today has no equivalent turnkey instruction sequence for installing itself into its own tool directory.

2. **`docs/copy`** — State install directory conventions explicitly in `AGENT_ONBOARDING_SNIPPET` / the SKILL.md preamble in `skill.ts`: `~/.claude/skills/helix/` and `.claude/skills/helix/` (Claude Code), `~/.codex/skills/helix/` / `.agents/skills/helix/` (Codex), `~/.agents/skills/helix/` (Cursor/other). *Why:* Exa's prompt names these paths explicitly so an agent doesn't have to guess where a portable skill belongs; Helix's `preamble()` in `skill.ts` currently says nothing about where the generated file should live on disk once fetched.

3. **`docs/copy`** — Add a secret-handling hard rule to the generated SKILL.md preamble (`skill.ts` `preamble()`), mirroring Exa's "only ever inspect it via a presence/length check... never print, echo, cat" rule, scoped to `HELIX_API_KEY`. *Why:* Helix's preamble currently documents the auth header and rate-limit headers but says nothing about how an agent should safely check for/store a key it already has versus request a new one — a real gap for an unattended agent following the onboarding flow, and this is a `docs/copy` change (no server behavior implied), so it doesn't touch the Claims Guard.

4. **`API change`** — Consider a `maxAgeHours`-equivalent freshness knob on `/v1/scrape` and `/v1/crawl`, separate from the existing `tier` escalation ladder: a numeric cache-age ceiling (0 = force fresh, omitted = allow cached) rather than a boolean. *Why:* Helix's scrape/crawl today re-fetch every time; Exa's `maxAgeHours` gives the caller a cheap way to say "cached is fine unless it's stale," which is a genuine cost lever for high-volume agent callers, distinct from Helix's existing `tier: auto` escalation (which is about *how* to fetch, not *whether a fresh fetch is needed at all*). This is additive to the existing envelope, not a rewrite.

5. **`API change`** — Add a `findSimilar`-equivalent to `/v1/search`: given a `url` instead of a `query`, return pages Helix's search backend judges similar (via whatever search provider is wired in, e.g. an embedding-similarity call if the provider supports it, or a fallback "site: read the page, extract key terms, re-search" if not). *Why:* it's a distinct, well-known retrieval shape ("more like this") that Helix's current `search` (`query` in, ranked `web[]` out per `research/api-specs`) doesn't cover, and it's additive — a new optional input mode, not a change to existing behavior. Lower priority than items 1–4; flag as a nice-to-have, not urgent, since no current Helix consumer has asked for it.

6. **`UI`** — On the dashboard's agent-onboarding page (whatever renders `/agent-onboarding/SKILL.md`'s human-facing wrapper, if any exists beyond the raw file), consider a single copy-to-clipboard button whose label matches the "one clear action" pattern Exa uses ("Copy this setup prompt into your agent") rather than Helix's current split between a cURL snippet and a separate "View the skill" link. *Why:* Exa's pattern collapses install to one clipboard action; Helix currently requires the agent (or the human copying on its behalf) to run a curl command *and* separately know to fetch the linked SKILL.md — consolidating to one prompt reduces onboarding friction without adding any claim that would trip the Claims Guard.

7. **Explicitly NOT adopted** — Exa's benchmark/speed marketing (`sub200ms`, `"20x better than Google"`, named third-party benchmarks) is the single clearest anti-pattern relative to Helix's own Claims Guard (`WEBSITE.md` §11: "No benchmarks, latencies as measurements, coverage percentages, or 'faster than' claims... No 'beats Cloudflare' or stealth-success claims"). Nothing about Exa's speed-tier naming (`instant`/`fast`/`auto`/`deep`) requires stating a benchmark number to be useful — Helix already has an analogous `tier: auto | plain | tls | lightpanda | chromium` escalation ladder (per `research/api-specs`) that names *what* strategy runs without claiming a latency number, and that distinction should be preserved rather than eroded by copying Exa's numeric claims alongside its tier-naming idea.

---

## 5. Sources (all fetched 2026-09-02)

- https://exa.ai — homepage positioning/taglines
- https://exa.ai/docs/llms.txt — documentation index (redirect target of `docs.exa.ai/llms.txt`)
- https://exa.ai/docs/reference/getting-started — search types overview, contents options, dashboard-onboarding callout (redirect target of `docs.exa.ai/reference/getting-started`)
- https://exa.ai/docs/reference/search — full `/search` parameter reference: `type`, `category`, date filters, domain filters, `numResults`, `text`/`highlights`/`summary`/`maxAgeHours`
- https://exa.ai/docs/reference/answer — `/answer` endpoint: direct-answer vs. summary-with-citations, `model` variants, `outputSchema`, streaming
- https://exa.ai/docs/reference/exa-mcp — MCP server docs: install paths per client, four tools
- https://exa.ai/docs/reference/agent-skills — Agent Skills index: five skills listed with links
- https://exa.ai/docs/reference/agent-skills/build-with-exa — the setup-prompt widget page; fetched both via WebFetch and raw `curl` (369,686 bytes HTML saved and grepped locally) to confirm exact button label, absence of an "Open in" dropdown, and the three logo URLs
- https://raw.githubusercontent.com/exa-labs/agent-skills/main/skills/build-with-exa/SKILL.md — full SKILL.md content (176 lines), quoted directly for scope/installation/authentication/ZDR sections
- https://raw.githubusercontent.com/exa-labs/agent-skills/main/README.md — skills repo README: skill table, `npx skills add` install command
- https://api.github.com/repos/exa-labs/agent-skills/contents/ and .../contents/skills — repo structure confirmation (five skill directories, each with SKILL.md + references/)
- https://exa.ai/docs/websets/overview — Websets four-stage flow (URL path guessed; treat structure as directionally accurate, not confirmed canonical)
- https://exa.ai/blog — recent posts list (titles/dates as returned by WebFetch summary)
- https://exa.ai/blog/announcing-series-c — Series C claims: sub200ms, 20x token reduction, 1000x search-volume projection, "perfect search" framing
- https://exa.ai/blog/perfect-search — agent-usage-pattern framing ("potentially hundreds of times" in the background)
- github.com/exa-labs/exa-mcp-server — MCP server README (tool names/descriptions; fetched via WebFetch, not raw source — treat tool descriptions as high-confidence but not byte-verified)

**Not independently verified / could not fetch directly in this pass:**
- `exa.ai/docs/reference/findsimilar` (404 on guessed path) — `findSimilar` capability referenced by the docs index and MCP tooling but exact parameter list not confirmed here.
- `exa.ai/docs/reference/agent` (404 on guessed path) — Agent API details drawn from the MCP tool description and the `build-with-exa` skill's scope section, not the endpoint's own reference page.
- The claimed third-party benchmark names (FRAMES, Tip-of-Tongue, Seal0) and "under 180ms... faster than any other search provider" homepage claim were relayed by the WebFetch summarizer, not confirmed against raw HTML the way the setup-prompt widget was — treat as reported-but-unverified wording.
- Whether a `keyword`-only `type` value still exists on `/search` (older Exa material used a neural/keyword framing; current fetched docs describe only the six speed-tier values).
