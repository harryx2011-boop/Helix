# 0002. Ship full Chromium (`channel: 'chromium'`) for the browser tier

Status: Accepted (Harry, 2026-10-10; `docs/plans/2026-10-05-suite-plan.md`, "Design calls folded into Phase 1")

## Context

Phase 1 of the suite plan is anti-bot and scraping efficiency. Its design call is to ship full Chromium, reversing `DESKTOP-PLAN.md` D14, which the suite plan records as D17.

## Decision

- Ship `channel: 'chromium'` (full Chromium, about 450 MB).

## Consequences

- The browser download is about 450 MB, far larger than the earlier build.
- Stealth and anti-bot work in Phase 1 runs on full Chromium.
