# To Do

Open work at 1.11.1. Ordered by what unblocks the most. Detail and reasoning live in `HANDOFF.md` and `context.md`.

## Blocking

- [ ] **Deploy the API** (`DEPLOY.md` §4–5). Nothing else on this list moves until it exists.
      Use the Supabase **session pooler** for `DATABASE_URL` — 5432, not the transaction
      pooler on 6543. The API applies its own migrations at boot.
- [ ] **Set `HELIX_MULTI_TENANT=1` on the deployed API.** Until then 1.11.0's tenant
      scoping is inert and `/v1/keys`, `/v1/jobs/*` and `/v1/usage/all` are cross-tenant
      readable. Verify: `/v1/keys` and `/v1/usage/all` must return 404. A 200 means the
      variable never reached the API.

## Security

- [ ] **RLS keyed on `profile_id` from the Clerk claim.** 1.11.1 closed the browser
      surface; `/v1/*` is still guarded by application code alone. Read `context.md`
      1.11.1 before starting — the obvious design was rejected for three concrete
      reasons and repeating it would waste the effort.
- [ ] Decide whether the repo goes public. The site claims Apache-2.0 in several places
      and every GitHub link 404s while it is private.

## Runtimes

- [ ] Run `fetch` (7401, Rust) and `extract` (7402, Python) so scrape and parse work
      end to end. Health reports them unhealthy today, which is correct.
- [ ] Add `playwright install-deps` to the Docker image for Firefox and WebKit.
      Flagged in 1.7.0, unverified since nothing containerised has been built.
- [ ] Deploy the Converter (`apps/converter` 4400, `apps/converter-api` 8400), then set
      `NEXT_PUBLIC_CONVERTER_URL`. The footer and nav rows appear on their own once it
      is set; they are filtered out while it is empty.

## Quality

- [ ] **Interaction testing.** Every UI check so far has been curl-level — no focus,
      keyboard or hover behaviour has ever been exercised, and `/app/*` sits behind a
      Clerk interstitial so those screens have only been source-reviewed.
- [ ] Give `crawl` a per-request `proxy` option; `/scrape` has one. A wire change, so it
      needs a version bump and an `openapi.yaml` update.
- [ ] Delete `components/shell/top-nav.tsx` — zero importers, holds the last stray
      `rounded-md` in the tree.

## Deferred by choice

These are in `MILESTONES.md` as unchecked and are deliberate, not neglected: image OCR,
a separate OCR queue, codegen for the three runtimes, dead-letter replay, prompt caching,
multi-page monitors, and human-takeover on the interactive live view.
