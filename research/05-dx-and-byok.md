# Developer Experience + BYOK (agent 5)
Evidence base = live GitHub issues + vendor docs only (WebSearch quota exhausted; Reddit blocked).

## DX GAPS
1. MCP tool schemas underspecified — firecrawl-mcp-server #325: 132 PARAMETERS LACK DESCRIPTIONS,
   hurting agent tool-selection accuracy. #373 scrape tool input schema incorrectly declares JSON
   options, breaking JSON extraction for schema-validating MCP clients. #357 README disagrees with
   v3.23.3 behavior. #311 search declares readOnlyHint:true but accepts scrapeOptions.actions.
   (7.3k stars, 861 forks — and still unfixed.) Difficulty: LOW. Pure process discipline + CI validation.
2. Streaming/SSE for long jobs — MCP server has SSE as TRANSPORT (HTTP_STREAMABLE_SERVER=true) but
   core crawl/agent API is still poll-or-wait. Their own README flags "crawl responses can be very
   large and may exceed token limits" + "agent research can take minutes". Difficulty: MEDIUM.
3. Playground under-invested — #4120 "Error tooltip overflows its container on homepage Scrape widget"
   (Jul 24 2026). browse.ai does the confirmation-loop UX well: "Is this the data you were looking
   for?" Yes/No iterate-visually. Difficulty: MEDIUM.
4. Visual point-and-click selector builder — no Firecrawl request (they're LLM-extraction-first) but
   ParseHub/Octoparse/browse.ai sustained popularity = durable demand. browse.ai robots click
   dropdowns/radios/toggles, fill forms, scroll + "AI-powered adaptive monitoring" that adapts to
   layout changes rather than breaking. Difficulty: HIGH.
5. **COST ESTIMATOR BEFORE RUNNING — genuine whitespace, nobody does it.**
   Evidence: #3552 "agent fails with 'Refusal: Error: Agent reached max credits' on every SPA careers
   URL"; #4083 "Empty OPENAI_API_KEY/OPENAI_BASE_URL bypass zod handling: json scrape format FAILS
   SILENTLY WHILE STILL CONSUMING CREDITS". Difficulty: LOW-MEDIUM (calculator + HEAD-style probe).
6. Replay/debug a past scrape — see the raw HTML/screenshot/network trace/rendered DOM the scraper
   actually saw. Browserbase "Observability: unified debugging your agent across replays, logs and
   prompts". Steel.dev "Session Viewer... view and debug live or recorded sessions".
   No scraping API does this. Difficulty: MEDIUM.
7. Deterministic re-runs / cache correctness — #3968 "[Bug] Cached PDF scrape returns markdown for a
   DIFFERENT URL" (Jul 8 2026). A cache-key scoping defect in exactly this feature. Difficulty: MEDIUM
   (the whole difficulty IS cache-key correctness — must include ALL option params, not just URL).
8. Local CLI dev loop — uncited for Firecrawl; Apify CLI (`apify run`) is the precedent. Difficulty: LOW.
9. SDK parity + ergonomics — #814 Go SDK missing batch scrape; #4252 "json format silently returns
   empty via Responses API on OpenAI-compatible backends".
   APIFY PYTHON SDK IS THE REFERENCE BAR: `async with Actor:` manages full lifecycle incl. shutdown,
   failures, platform events; Actor.get_input() validates against schemas AND auto-decrypts sensitive
   fields; proxy mgmt abstracts group selection/country targeting/rotation with session + tiered-proxy
   support. Integrates with Crawlee/Scrapy/Playwright/Selenium rather than forcing one paradigm.
   Difficulty: MEDIUM.
10. Spec-driven OpenAPI — #373/#357/#4252 are exactly the drift class that generated clients eliminate
    by construction. Difficulty: LOW-MEDIUM.
11. Provider-agnostic extraction — #1826 "[Feat] Add LiteLLM Support" FILED AND CLOSED (2025-09-28).
    Direct demand, not shipped for hosted. Crawl4AI is the reference impl. Difficulty: MEDIUM.

## BYOK — THE SMOKING GUN
**#4083 (Jul 20 2026): Firecrawl's HOSTED product already accepts OPENAI_API_KEY / OPENAI_BASE_URL
parameters — but it's BROKEN. Request fails silently AND still burns platform credits.**
Users are actively trying to BYOK on hosted and it does not work.
Combined with #3552 (agent hits max credits on SPA URLs), the LLM-heavy ops (extract/agent) are
exactly where credit burn is unpredictable and where BYOK would directly fix it.
Difficulty: LOW — the parameter is already threaded through their code. The gap is correctness
(zod validation) + productization (docs, billing separation), NOT new architecture.

## BYOK precedents
- Firecrawl SELF-HOST already does it: SELF_HOST.md "AI-backed features: no model provider.
  Connect OpenAI, an OpenAI-compatible endpoint, or Ollama when a feature needs it."
  So the plumbing is PROVEN — it's just withheld from the hosted product. That gap IS the opportunity.
- Crawl4AI does it cleanly in the OSS product itself:
  LLMConfig(provider="openai/gpt-4o", api_token=os.getenv('OPENAI_API_KEY'))
  "supports all LLMs (open-source and proprietary)", any LiteLLM-compatible incl. ollama/qwen2,
  Docker configures providers via env vars.
- CURSOR is the best-documented economic analog: "send unlimited AI messages at your own cost through
  providers like OpenAI, Anthropic, or Google" WITH transparent tradeoff disclosure:
  "Custom API keys only work with chat models... Cursor's Zero Data Retention policy does NOT apply
  when you use your own API keys" and "keys... are sent to our backend with every request."
  <-- Use this as the design template for honest BYOK disclosure.
- OpenRouter: one key, "picks the most cost-effective option for each request".

## BYO-everything
- BYO-proxy: uncited as a Firecrawl request. Apify Proxy (group selection, country targeting,
  rotation, session + tiered support) is the bundled model to unbundle. Difficulty: MEDIUM
  (pluggable SOCKS5/HTTP adapter + QA against BrightData/Oxylabs).
- BYO-browser-pool: Steel.dev markets "1-line Change to Run Puppeteer" — the exact adapter pattern
  in reverse. Accept a user-supplied CDP endpoint. Difficulty: MEDIUM (normalizing screenshots,
  session limits, proxy chaining across arbitrary backends is the hard part).
- BYO-storage (S3/GCS): LOW. BYO-vector-DB: MEDIUM (adapters per DB, embedding model tied to BYO LLM key).

## Economic argument
Standard tier = 100,000 pages for $83 ≈ $0.00083/page platform fee. That alone doesn't prove markup,
but Cursor's published model demonstrates the mechanism: subscription/credit pricing bundles margin on
raw provider cost; BYOK removes it in exchange for the user managing their own provider relationship
and accepting the ZDR/privacy tradeoff. A precise Firecrawl-credits-vs-BYOK dollar comparison was NOT
found published anywhere — flag the quantification as uncited, the mechanism as well-cited.
