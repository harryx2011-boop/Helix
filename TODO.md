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
      `SUITE-PLAN.md` Phase 2). Open: the desktop app's settings carry no `SEARXNG_URL`.
- [ ] Decide whether the repo goes public. The site claims Apache-2.0 in several places
      and every GitHub link 404s while it is private.

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
- [ ] Delete `components/shell/top-nav.tsx` — zero importers, holds the last stray
      `rounded-md` in the tree.

## Deferred by choice

These are in `MILESTONES.md` as unchecked and are deliberate, not neglected: image OCR,
a separate OCR queue, codegen for the three runtimes, dead-letter replay, prompt caching,
multi-page monitors, and human-takeover on the interactive live view.
