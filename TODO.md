# To Do

Open work at 2.3.2 (audited 2026-10-10). Harry's five suite goals (anti-bot, `helix_image_sheet`,
`helix_data_miner`, the VS Code extension with monitor summaries, Composio sources) are tracked in
`SUITE-PLAN.md` and the Helix entry of `~/.claude/BACKLOG.md`. Detail lives in `context.md`.

Nothing here is blocking. The full stack runs locally and every endpoint has been
exercised against it.

## Next

- [x] **`FOLLOWUPS-PLAN.md`** (2026-09-26): done. Phases 0–4 landed (crawl/batch URL fix, loud failures,
      Ollama detection, `/jobs/{id}/ladder` + `/cost`, `/vectors/search` in 2.1.0); the closing live smoke is 64/0/2.
- [ ] **RLS keyed on `profile_id` from the Clerk claim.** 1.11.1 closed the browser
      surface; `/v1/*` is still guarded by application code alone. Read `context.md`
      1.11.1 first — the obvious design was rejected for three concrete reasons and
      repeating it would waste the effort.
- [ ] **Interaction testing.** Every UI check so far has been curl-level. No focus,
      keyboard or hover behaviour has ever been exercised, and `/app/*` sits behind a
      Clerk interstitial so those screens have only been source-reviewed.
- [x] Configure a search backend: SearXNG on 127.0.0.1:7440 for the dev stack (2.3.0,
      `SUITE-PLAN.md` Phase 2). Closed 2026-10-17. The 2026-10-16 settings row alone did not
      take effect: `ConfigSchema` had no `searxngUrl` and the provider read `process.env`.
      Now `config.searxngUrl` (from `SEARXNG_URL` or a stored setting) builds the provider,
      feeds `/health`, and shows in the settings screen.
- [x] Decide whether the repo goes public. Done 2026-10-12: `harryx2011-boop/Helix` is PUBLIC.
      The LICENSE note here was wrong: `LICENSE` is in the repo root and
      `apps/desktop/electron-builder.yml` already points NSIS at it (checked 2026-10-16).
- [ ] **New captured browser profiles.** The last open item of `SUITE-PLAN.md` Phase 1.
      `packages/profiles/definitions/` still holds only `chrome-137-macos` and
      `chrome-148-windows`. Their `$comment` names a `tools/capture` that is not in the
      repo, and a `js` block has to be recorded from a real browser — a hand-written value
      is what detection looks for. Build the capture tool first; `ja4` stays
      `unset_transport_owned_by_wreq_util` (the transport is wreq-util's).

## Hosting — only if the public site should work for other people

The full stack runs locally and nothing local needs any of this.
`helixapi-dev.vercel.app` has no API behind it, so it is a shell for anyone but you.

- [x] ~~Host the API, then set `HELIX_MULTI_TENANT=1` on it.~~ Dropped 2026-09-25: the flag was
      removed in `DESKTOP-PLAN.md` Phase 3; Helix ships as a single-user desktop app.
- [x] ~~Host the Converter.~~ Dropped 2026-09-25: the Converter left Helix; file conversion
      lives in Sparky.
- [ ] `--build-arg HELIX_BROWSER_ENGINES="chromium firefox"` when building the API image,
      if a container should offer Firefox or WebKit. Chromium alone is the default.

## Smaller

- [ ] Give `crawl` a per-request `proxy` option; `/scrape` has one. A wire change, so it
      needs a version bump and an `openapi.yaml` update.
- [ ] `notModified` on a pipeline success is not in `openapi.yaml`. It is internal today
      (only the crawl sends conditional headers and only the crawl reads the flag), but a
      `/scrape` caller can send `If-None-Match` in `headers` and now gets an empty 200
      document back. Decide whether to document it or to answer a caller-conditional
      scrape differently, and surface it on `/scrape` and `/search` rows; either way it is a
      wire change and needs a bump.
- [ ] **An incremental crawl stops below a 304 page.** A 304 has no body and so no links,
      and the frontier expands only from `result.content.links`. Since 2026-10-17 the crawl
      says so (`usage.pagesLinksNotFollowed` plus a warning); a live re-crawl of
      docs.python.org reached 1 page where the first run reached 3. Fix: store each page's
      links in `crawl_state` (a migration, both runners) and expand from the stored links
      when the page answers 304.
- [ ] Cap the per-host state in `core/host-gate.ts`'s shared `PolitenessController`, as
      `TierMemory` caps its map. One entry per host ever asked, never evicted, for the life
      of the process.
- [ ] Move `mapWithLimit` from `routes/search.ts` to `core/`: `/extract` and `/enrich`
      import it from a route file.
- [ ] Delete `components/shell/top-nav.tsx` — zero importers, holds the last stray
      `rounded-md` in the tree.

## Deferred by choice

These are in `MILESTONES.md` as unchecked and are deliberate, not neglected: image OCR,
a separate OCR queue, codegen for the three runtimes, dead-letter replay, prompt caching,
multi-page monitors, and human-takeover on the interactive live view.
