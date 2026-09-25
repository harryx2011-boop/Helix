# To Do

Open work at 1.11.3, with another session's 1.12.0 converter work uncommitted in the tree.
Detail and reasoning live in `HANDOFF.md` and `context.md`.

Nothing here is blocking. The full stack runs locally and every endpoint has been
exercised against it.

## Next

- [ ] **RLS keyed on `profile_id` from the Clerk claim.** 1.11.1 closed the browser
      surface; `/v1/*` is still guarded by application code alone. Read `context.md`
      1.11.1 first — the obvious design was rejected for three concrete reasons and
      repeating it would waste the effort.
- [ ] **Interaction testing.** Every UI check so far has been curl-level. No focus,
      keyboard or hover behaviour has ever been exercised, and `/app/*` sits behind a
      Clerk interstitial so those screens have only been source-reviewed.
- [ ] Configure a search backend (`SEARXNG_URL`, `SERPER_API_KEY` or `SERPAPI_KEY`) if
      `/v1/search` should work. It returns 503 until one is set — configuration, not a
      fault.
- [ ] Decide whether the repo goes public. The site claims Apache-2.0 in several places
      and every GitHub link 404s while it is private.

## Hosting — only if the public site should work for other people

The full stack runs locally and nothing local needs any of this.
`helixapi-dev.vercel.app` has no API behind it, so it is a shell for anyone but you.

- [ ] Host the API, then set `HELIX_MULTI_TENANT=1` on it. Verify `/v1/keys` and
      `/v1/usage/all` return 404 — a 200 means the variable never reached the API.
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
