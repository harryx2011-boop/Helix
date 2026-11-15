# 0003. SearXNG search runs on a URL the user sets, not a bundled Docker

Status: Accepted (Harry, 2026-10-10; `docs/plans/2026-10-05-suite-plan.md`, "Design calls folded into Phase 1" and the header)

## Context

Image search and the Phase 2 search backend run on SearXNG. The suite plan header says image search "runs on SearXNG in WSL Docker" on the dev stack.

## Decision

- Add a `SEARXNG_URL` settings field to the desktop app. The user points it at their own SearXNG instance.
- No SearXNG container is bundled with the desktop app.

## Consequences

- Search in the desktop app needs an instance the user runs. ROADMAP phase 2 answers "on the SearXNG stack".
- The app has no Docker dependency.
